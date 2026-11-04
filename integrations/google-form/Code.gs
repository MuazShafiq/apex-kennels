/**
 * Apex Kennels: Form-bound Google Apps Script adapter.
 * Disabled until Fatima reviews every form field, pricing interpretation and permissions.
 * Map stable Form item IDs, never question titles or Sheet column numbers.
 *
 * Required Script Properties (never commit values):
 *   APEX_INTAKE_ENABLED = false | true
 *   APEX_API_URL = https://apex-kennels-api.muaz-shafiq18.workers.dev/api/ingest
 *   APEX_INTAKE_TOKEN = [private runtime bearer token]
 *   APEX_FIELD_MAP = JSON object of semantic fields -> Form item IDs
 * Optional, for explicitly approved manual reconciliation:
 *   APEX_RECONCILE_AFTER = ISO timestamp, e.g. 2026-11-05T00:00:00+05:00
 */

function apexProperties() {
  return PropertiesService.getScriptProperties();
}

function apexConfig() {
  var props = apexProperties();
  if (props.getProperty('APEX_INTAKE_ENABLED') !== 'true') return null;
  var url = props.getProperty('APEX_API_URL');
  var token = props.getProperty('APEX_INTAKE_TOKEN');
  var mapRaw = props.getProperty('APEX_FIELD_MAP');
  if (!url || !token || !mapRaw) throw new Error('Apex integration properties incomplete');
  if (url.indexOf('https://') !== 0 || !/\/api\/ingest$/.test(url)) {
    throw new Error('Apex endpoint must be HTTPS /api/ingest');
  }
  return {url:url,token:token,map:JSON.parse(mapRaw)};
}

/** Ignore harmless whitespace differences in Form labels without rewriting the form. */
function apexNormalizeLabel(value) {
  return String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Support both the single-choice and checkbox grid variants, without reading answers. */
function apexGridMetadata(item) {
  var type = item.getType();
  if (type === FormApp.ItemType.GRID) return item.asGridItem();
  if (type === FormApp.ItemType.CHECKBOX_GRID) return item.asCheckboxGridItem();
  return null;
}

function apexBuildPayload(formResponse, fieldMap) {
  if (!formResponse || !formResponse.getId()) {
    throw new Error('Google response has no stable response ID');
  }
  var valuesById = {};
  var itemsById = {};
  formResponse.getItemResponses().forEach(function(answer) {
    var id=String(answer.getItem().getId());
    valuesById[id] = answer.getResponse();
    itemsById[id] = answer.getItem();
  });

  function answerFor(name) {
    var itemId=fieldMap[name];
    if (!itemId) return undefined;
    var value=valuesById[String(itemId)];
    if (value === undefined || value === null || value === '') return undefined;
    if (value instanceof Date) {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    if (Array.isArray(value)) return value.join(', ');
    return String(value).trim();
  }

  function yesNo(name) {
    var value=answerFor(name);
    if (value === undefined) return undefined;
    if (value === 'No') return false;
    if (/^Yes(?: |$)/.test(value)) return true;
    throw new Error('Unexpected answer for ' + name);
  }

  function traitsFromGrid() {
    var id=fieldMap.personalityGrid;
    if (!id) return undefined;
    var item=itemsById[String(id)];
    var responses=valuesById[String(id)];
    if (!item || !Array.isArray(responses)) return undefined;
    var grid=apexGridMetadata(item);
    if (!grid) throw new Error('Personality traits item is no longer a grid');
    var labels=grid.getRows().map(apexNormalizeLabel);
    var columns=grid.getColumns().map(apexNormalizeLabel);
    if (labels.length!==responses.length || columns.length!==2 ||
        columns.indexOf('Yes')===-1 || columns.indexOf('No')===-1) {
      throw new Error('Personality grid shape or choices changed');
    }
    var keys={
      'Friendly':'friendly','Fears (thunderstorms etc)':'fears','Climber':'climber',
      'Food Sensitivities':'foodSensitivities','Barks Excessively':'barksExcessively',
      'Allergies':'allergies','Bite History':'biteHistory','Medical Conditions':'medicalConditions'
    };
    var found={};
    var out={};
    labels.forEach(function(label,index){
      var key=keys[label];
      if (!key || found[key]) throw new Error('Unexpected or duplicate personality grid row');
      found[key]=true;
      var choice=responses[index];
      // Checkbox grids return String[][]; a single-choice grid returns String[].
      if (Array.isArray(choice)) {
        if (choice.length > 1) throw new Error('Multiple answers selected for one personality trait');
        choice=choice[0];
      }
      if (choice===null || choice===undefined || choice==='') return;
      choice=apexNormalizeLabel(choice);
      if (choice!=='Yes' && choice!=='No') {
        throw new Error('Unexpected personality grid answer; manual review required');
      }
      out[key]=(choice==='Yes');
    });
    if (Object.keys(found).length!==Object.keys(keys).length) {
      throw new Error('Personality trait rows changed; manual review required');
    }
    return out;
  }
  var accepted=answerFor('termsAccepted') === 'I have read and accept all the terms and conditions';

  return {
    source:'google_form',
    externalResponseId:String(formResponse.getId()),
    customerName:answerFor('customerName'),
    email:answerFor('email') || formResponse.getRespondentEmail() || undefined,
    phone:answerFor('phone'),
    petName:answerFor('petName'),
    startDate:answerFor('startDate'),
    endDate:answerFor('endDate'),
    accommodationType:answerFor('accommodationType'),
    details:{
      ownerAddress:answerFor('ownerAddress'),
      pickupDropoffRequested:yesNo('pickupDropoffRequested'),
      cameraCageRequested:yesNo('cameraCageRequested'),
      emergencyContactPhone:answerFor('emergencyContactPhone'),
      breed:answerFor('breed'),
      gender:answerFor('gender'),
      age:answerFor('age'),
      vaccinationStatus:answerFor('vaccinationStatus'),
      distemperHistory:answerFor('distemperHistory'),
      veterinarianPhone:answerFor('veterinarianPhone'),
      personalityTraits:traitsFromGrid(),
      specialInstructions:answerFor('specialInstructions'),
      medicationFeedingInstructions:answerFor('medicationFeedingInstructions'),
      termsAccepted:accepted
    }
  };
}

function apexSubmit(formResponse, config) {
  var payload = apexBuildPayload(formResponse,config.map);
  var response = UrlFetchApp.fetch(config.url,{
    method:'post',
    contentType:'application/json',
    headers:{Authorization:'Bearer '+config.token},
    payload:JSON.stringify(payload),
    muteHttpExceptions:true,
    followRedirects:false
  });
  var status=response.getResponseCode();
  // An unchanged repeated submission is a success, not a duplicate booking.
  if (status !== 200 && status !== 201) {
    // Intentionally omit request/response bodies, private tokens and personal data.
    throw new Error('Apex intake failed with HTTP '+status+'; retry via reconciliation after review');
  }
}

function onApexFormSubmit(event) {
  var config=apexConfig();
  if (!config) return;
  if (!event || !event.response) throw new Error('Requires Form submit event, not Sheet event');
  apexSubmit(event.response,config);
}

/**
 * Opt-in manual recovery for deliveries missed by an installable trigger.
 * No timer is automatically installed. Required review boundary:
 * APEX_INTAKE_ENABLED=true, APEX_RECONCILE_AFTER set to owner's approved start date.
 * Hard cap prevents accidentally importing a large historical backlog.
 */
function reconcileApexRecentResponses() {
  var config=apexConfig();
  if (!config) throw new Error('Apex intake is disabled; no reconciliation performed');
  var since=apexProperties().getProperty('APEX_RECONCILE_AFTER');
  var sinceMs=Date.parse(since||'');
  if (!since || isNaN(sinceMs)) throw new Error('Set a reviewed ISO APEX_RECONCILE_AFTER first');

  var lock=LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Apex reconciliation is already running');
  try {
    var form=FormApp.getActiveForm();
    if (!form) throw new Error('Run from the actual form-bound Apps Script');
    var responses=form.getResponses(new Date(sinceMs)).filter(function(r) {
      return r.getTimestamp().getTime() >= sinceMs;
    });
    if (responses.length > 50) {
      throw new Error('More than 50 responses since approved start; review explicit backfill first');
    }
    responses.forEach(function(response) { apexSubmit(response,config); });
    Logger.log('Apex reconciliation completed. Number of responses checked: '+responses.length);
  } finally {
    lock.releaseLock();
  }
}

/** Lists only question titles and IDs, never submitted personal answers. */
function listApexFormItemIds() {
  var form=FormApp.getActiveForm();
  if (!form) throw new Error('Run in the bound Form Apps Script editor');
  Logger.log(JSON.stringify(form.getItems().map(function(item){
    return {id:String(item.getId()),title:item.getTitle()};
  })));
}

/**
 * Local-only validation of ONE explicitly synthetic test response.
 * Does not send anything, and logs presence/absence only.
 */
function validateApexSyntheticResponseMapping() {
  var props=apexProperties();
  var raw=props.getProperty('APEX_FIELD_MAP');
  var testId=props.getProperty('APEX_TEST_RESPONSE_ID');
  if (!raw || !testId) throw new Error('Set APEX_FIELD_MAP and APEX_TEST_RESPONSE_ID');
  var form=FormApp.getActiveForm();
  if (!form) throw new Error('Run in the bound Form Apps Script editor');
  var response=form.getResponse(testId);
  if (!response) throw new Error('Synthetic response ID not found');
  var payload=apexBuildPayload(response,JSON.parse(raw));
  var fields=['customerName','email','phone','petName','startDate','endDate'];
  var detailsFields=['ownerAddress','pickupDropoffRequested','cameraCageRequested','emergencyContactPhone',
    'breed','gender','age','vaccinationStatus','distemperHistory','veterinarianPhone',
    'personalityTraits','specialInstructions','medicationFeedingInstructions','termsAccepted'];
  Logger.log(JSON.stringify({
    core:fields.map(function(field){return {field:field,provided:!!payload[field]};}),
    details:detailsFields.map(function(field){
      return {field:field,provided:payload.details[field]!==undefined};
    })
  }));
}


/**
 * Propose a stable ID map from the verified Form structure, with no answers
 * or personal data. Does NOT save the property or trigger any webhook.
 * Review the output before copying to Script Property APEX_FIELD_MAP.
 */
function proposeApexFieldMap() {
  var form=FormApp.getActiveForm();
  if (!form) throw new Error('Open this script from the live Form editor');
  var items=form.getItems();
  var names={
    startDate:'Boarding Period (start date)',
    endDate:'Boarding Period (end date)',
    customerName:"Owner's Name",
    ownerAddress:'Address',
    pickupDropoffRequested:'Will you require pick-up and drop-off for your pet?',
    cameraCageRequested:'Camera Cage with 24/7 CCTV:',
    phone:'Phone number',
    emergencyContactPhone:'Emergency Contact number',
    petName:"Dog's Name",
    breed:'Breed',
    gender:'Gender',
    age:'Age',
    vaccinationStatus:'Vaccination status',
    distemperHistory:'Has your pet ever been diagnosed with Canine Distemper?',
    veterinarianPhone:'Veterinarian contact number',
    specialInstructions:'Special Instructions',
    medicationFeedingInstructions:'Medications and Feeding Instructions'
  };
  var map={};
  Object.keys(names).forEach(function(field){
    var matches=items.filter(function(item){
      return item.getTitle().trim()===names[field];
    });
    if(matches.length!==1){
      throw new Error('Review question ' + field + ' (expected exactly one matching title; found '+matches.length+')');
    }
    map[field]=String(matches[0].getId());
  });
  var traitRows=['Friendly','Fears (thunderstorms etc)','Climber','Food Sensitivities',
    'Barks Excessively','Allergies','Bite History','Medical Conditions'];
  var grids=items.filter(function(item){
    var grid=apexGridMetadata(item);
    if (!grid) return false;
    var rows=grid.getRows().map(apexNormalizeLabel);
    var columns=grid.getColumns().map(apexNormalizeLabel);
    return traitRows.length===rows.length &&
      traitRows.every(function(row,i){return rows[i]===row;}) &&
      columns.length===2 && columns.indexOf('Yes')!==-1 && columns.indexOf('No')!==-1;
  });
  if(grids.length!==1) throw new Error('Personality trait grid not uniquely identified');
  map.personalityGrid=String(grids[0].getId());
  var consent=items.filter(function(item) {
    if(item.getType()!==FormApp.ItemType.CHECKBOX) return false;
    return item.asCheckboxItem().getChoices().some(function(choice){
      return choice.getValue()==='I have read and accept all the terms and conditions';
    });
  });
  if(consent.length!==1) throw new Error('Terms checkbox not uniquely identified');
  map.termsAccepted=String(consent[0].getId());
  // Email may be native Form collection, not a normal item; don't invent an ID.
  Logger.log('APEX_FIELD_MAP PROPOSAL (item IDs only, no answers): '+JSON.stringify(map));
}
