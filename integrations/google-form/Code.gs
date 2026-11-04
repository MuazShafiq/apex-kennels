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
 *   APEX_OWNER_APPROVED_LIVE = false unless explicit owner go-live approval
 * Canary-only (does not enable regular intake): APEX_CANARY_OWNER_NAME, APEX_CANARY_COMPLETE
 * Optional, for explicitly approved manual reconciliation:
 *   APEX_RECONCILE_AFTER = ISO timestamp, e.g. 2026-11-05T00:00:00+05:00
 */

function apexProperties() {
  return PropertiesService.getScriptProperties();
}

function apexProductionWebhookConfig() {
  var props=apexProperties();
  var url=props.getProperty('APEX_API_URL');
  var token=props.getProperty('APEX_INTAKE_TOKEN');
  var mapRaw=props.getProperty('APEX_FIELD_MAP');
  // Fail closed: do not let a live Google Form trigger use the staging URL.
  if (url!=='https://apex-kennels-api.muaz-shafiq18.workers.dev/api/ingest') {
    throw new Error('Production Worker endpoint not explicitly configured');
  }
  if (!token || token.length<32 || !mapRaw) {
    throw new Error('Apex production webhook properties incomplete');
  }
  return {url:url,token:token,map:JSON.parse(mapRaw)};
}

function apexConfig() {
  var props=apexProperties();
  if (props.getProperty('APEX_INTAKE_ENABLED')!=='true') return null;
  if (props.getProperty('APEX_OWNER_APPROVED_LIVE')!=='true') {
    throw new Error('Live intake is blocked pending owner approval');
  }
  return apexProductionWebhookConfig();
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
  var props=apexProperties();
  var live=props.getProperty('APEX_INTAKE_ENABLED')==='true';
  var canaryMarker=props.getProperty('APEX_CANARY_OWNER_NAME');
  if (!live && !canaryMarker) return;
  if (!event || !event.response) throw new Error('Requires a Form submit event');
  if (live) {
    if (canaryMarker) throw new Error('Disarm test canary before enabling live intake');
    var liveConfig=apexConfig(); // Enforces recorded owner approval.
    apexSubmit(event.response,liveConfig);
    return;
  }

  // Canary is a single, explicitly named synthetic response; all other
  // real customer submissions are ignored while normal intake is disabled.
  var mapRaw=props.getProperty('APEX_FIELD_MAP');
  if (!mapRaw) throw new Error('Cannot match Form canary without saved field IDs');
  var map=JSON.parse(mapRaw);
  var customerId=String(map.customerName);
  var petId=String(map.petName);
  var candidateName, candidatePet;
  event.response.getItemResponses().forEach(function(answer){
    var id=String(answer.getItem().getId());
    if (id===customerId) candidateName=String(answer.getResponse()).trim();
    if (id===petId) candidatePet=String(answer.getResponse()).trim();
  });
  if (candidateName!==canaryMarker || candidatePet!=='APEX SYNTHETIC CANARY PET') return;

  var lock=LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Canary is already processing; retry after inspecting trigger execution');
  try {
    if (props.getProperty('APEX_CANARY_COMPLETE')==='true') return;
    apexSubmit(event.response,apexProductionWebhookConfig());
    props.setProperty('APEX_CANARY_COMPLETE','true');
    Logger.log('APEX REAL FORM CANARY PASS: one synthetic submission delivered. Response ID: '+String(event.response.getId())+'. Intake remains disabled for ordinary customers.');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Idempotently install exactly one Form-specific submit trigger while intake is
 * disabled. Does not access historical responses or send any HTTP request.
 */
function apexArmRealFormCanary() {
  var props=apexProperties();
  if (props.getProperty('APEX_INTAKE_ENABLED')!=='false') {
    throw new Error('Disable regular intake before arming a synthetic canary');
  }
  if (props.getProperty('APEX_OWNER_APPROVED_LIVE')==='true') {
    throw new Error('Canary must not be armed with live intake approval already set');
  }
  var form=FormApp.getActiveForm();
  if (!form) throw new Error('Must run in the original Form-bound Apps Script project');
  // Recheck the saved form item IDs; do not rebuild/overwrite them during a cutover.
  validateApexSavedFieldMap();
  apexProductionWebhookConfig();
  var triggers=ScriptApp.getProjectTriggers().filter(function(trigger){
    return trigger.getHandlerFunction()==='onApexFormSubmit';
  });
  if (triggers.length>1) throw new Error('Multiple Apex submit triggers exist; review them before cutover');
  if (triggers.length===1) {
    var t=triggers[0];
    if (t.getEventType()!==ScriptApp.EventType.ON_FORM_SUBMIT ||
        t.getTriggerSource()!==ScriptApp.TriggerSource.FORMS ||
        t.getTriggerSourceId()!==form.getId()) {
      throw new Error('Existing Apex trigger is not bound to the intended Form submit event');
    }
  } else {
    ScriptApp.newTrigger('onApexFormSubmit').forForm(form).onFormSubmit().create();
  }
  var marker='APEX CANARY '+Utilities.getUuid().slice(0,12).toUpperCase();
  props.setProperties({
    APEX_CANARY_OWNER_NAME:marker,
    APEX_CANARY_COMPLETE:'false',
    APEX_INTAKE_ENABLED:'false'
  });
  Logger.log('APEX CANARY ARMED: submit ONE clearly synthetic real Form response. Owner Name exactly: '+marker+' ; Dog Name exactly: APEX SYNTHETIC CANARY PET. Normal customer submissions remain ignored. No old responses are imported.');
}

/** Turns off the synthetic test gate without enabling regular intake. */
function apexDisarmRealFormCanary() {
  var props=apexProperties();
  if (props.getProperty('APEX_INTAKE_ENABLED')!=='false') {
    throw new Error('Cannot change canary settings when live intake is enabled');
  }
  props.deleteProperty('APEX_CANARY_OWNER_NAME');
  props.deleteProperty('APEX_CANARY_COMPLETE');
  Logger.log('APEX CANARY DISARMED: regular intake remains disabled; the trigger remains installed.');
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
function apexProposedFieldMap() {
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
  return map;
}

/** Read-only. Logs item IDs, never response contents. */
function proposeApexFieldMap() {
  Logger.log('APEX_FIELD_MAP PROPOSAL (item IDs only, no answers): '+JSON.stringify(apexProposedFieldMap()));
}

/**
 * One-time safe setup: saves the verified, metadata-only ID map while OFF.
 * No responses are read and no trigger, HTTP call or database write occurs.
 * This must never be used to reconfigure an already-live intake.
 */
function stageApexFieldMapDisabled() {
  var props=apexProperties();
  if (props.getProperty('APEX_INTAKE_ENABLED') === 'true') {
    throw new Error('Cannot replace field map while live intake is enabled');
  }
  var map=apexProposedFieldMap();
  props.setProperties({
    APEX_FIELD_MAP:JSON.stringify(map),
    APEX_INTAKE_ENABLED:'false'
  });
  Logger.log('APEX FIELD MAP STAGED: '+Object.keys(map).length+
    ' question IDs verified. APEX_INTAKE_ENABLED=false. No responses read or sent.');
}

/** Checks saved item IDs match current form metadata; never reads responses. */
function validateApexSavedFieldMap() {
  var props=apexProperties();
  if (props.getProperty('APEX_INTAKE_ENABLED') !== 'false') {
    throw new Error('Require disabled intake during metadata verification');
  }
  var raw=props.getProperty('APEX_FIELD_MAP');
  if (!raw) throw new Error('APEX_FIELD_MAP is not configured');
  var stored=JSON.parse(raw);
  var expected=apexProposedFieldMap();
  var keys=Object.keys(expected);
  if (Object.keys(stored).length!==keys.length ||
      keys.some(function(key){return String(stored[key]) !== String(expected[key]);})) {
    throw new Error('Stored field map differs from current form metadata; intake remains disabled');
  }
  Logger.log('APEX FIELD MAP VERIFIED: '+keys.length+
    ' item IDs match. Intake disabled. No customer responses accessed.');
}


/**
 * Dry-run of the real Form's question IDs and response parsing using in-memory
 * synthetic answers. NEVER calls FormResponse.submit(), getResponses(),
 * UrlFetchApp.fetch(), or saves test records. No secrets are required.
 */
function testApexSyntheticFormMapping() {
  var props=apexProperties();
  if (props.getProperty('APEX_INTAKE_ENABLED') !== 'false') {
    throw new Error('Disable intake before testing the Form mapping');
  }
  var raw=props.getProperty('APEX_FIELD_MAP');
  if (!raw) throw new Error('Run stageApexFieldMapDisabled first');
  var map=JSON.parse(raw);
  var expected=apexProposedFieldMap();
  var fields=Object.keys(expected);
  if (Object.keys(map).length!==fields.length ||
      fields.some(function(name){return String(map[name])!==String(expected[name]);})) {
    throw new Error('Saved Form item IDs differ from live metadata');
  }
  var form=FormApp.getActiveForm();
  var sample={
    startDate:new Date(2026,11,10,12,0,0),
    endDate:new Date(2026,11,12,12,0,0),
    customerName:'APEX SYNTHETIC OWNER',
    ownerAddress:'Synthetic sample address',
    pickupDropoffRequested:'No',
    cameraCageRequested:'Yes (Additional charges 500 per day apply)',
    phone:'03000000000',
    emergencyContactPhone:'03000000001',
    petName:'APEX SYNTHETIC PET',
    breed:'Mixed breed',
    gender:'Male',
    age:'3 years',
    vaccinationStatus:'Fully vaccinated and booster is up to date',
    distemperHistory:'No',
    veterinarianPhone:'03000000002',
    specialInstructions:'Synthetic sample only',
    medicationFeedingInstructions:'Synthetic feeding notes only',
    termsAccepted:['I have read and accept all the terms and conditions']
  };

  var responses=fields.map(function(field) {
    var item=form.getItemById(Number(map[field]));
    var answer=sample[field];
    if (field==='personalityGrid') {
      var grid=apexGridMetadata(item);
      if (!grid) throw new Error('Personality question is not a grid');
      var isCheckbox=item.getType()===FormApp.ItemType.CHECKBOX_GRID;
      answer=grid.getRows().map(function(row,index){
        var chosen=index===0 ? 'Yes' : 'No';
        return isCheckbox ? [chosen] : chosen;
      });
    }
    if (answer===undefined) throw new Error('Missing synthetic fixture for '+field);
    return {
      getItem:function(){return item;},
      getResponse:function(){return answer;}
    };
  });
  var syntheticResponse={
    getId:function(){return 'APEX-IN-MEMORY-TEST-ONLY';},
    getItemResponses:function(){return responses;},
    getRespondentEmail:function(){return 'synthetic@example.invalid';}
  };
  var payload=apexBuildPayload(syntheticResponse,map);
  if (payload.customerName!=='APEX SYNTHETIC OWNER' ||
      payload.email!=='synthetic@example.invalid' ||
      payload.startDate!=='2026-12-10' || payload.endDate!=='2026-12-12' ||
      payload.petName!=='APEX SYNTHETIC PET' ||
      payload.details.ownerAddress!=='Synthetic sample address' ||
      payload.details.cameraCageRequested!==true ||
      payload.details.pickupDropoffRequested!==false ||
      payload.details.termsAccepted!==true ||
      !payload.details.personalityTraits ||
      payload.details.personalityTraits.friendly!==true ||
      payload.details.personalityTraits.medicalConditions!==false ||
      payload.details.medicationFeedingInstructions!=='Synthetic feeding notes only') {
    throw new Error('In-memory Form mapping did not preserve required synthetic fields');
  }
  Logger.log('APEX SYNTHETIC FORM MAPPING PASSED: 19 IDs, dates, contact, add-ons, grid, pet care and consent. No responses read/submitted, no HTTP request.');
  return payload;
}


/**
 * Single staging preflight. Rechecks and saves the metadata-only map,
 * validates it, and runs an entirely in-memory synthetic response.
 * This DOES NOT submit a Form response, add a trigger, send an HTTP
 * request, import historical bookings, or enable ingestion.
 */
function apexPreflight() {
  stageApexFieldMapDisabled();
  validateApexSavedFieldMap();
  var sample=testApexSyntheticFormMapping();
  if (apexProperties().getProperty('APEX_INTAKE_ENABLED') !== 'false') {
    throw new Error('Unsafe configuration: intake must remain disabled');
  }
  Logger.log('APEX PREFLIGHT PASS: 19 question IDs verified, synthetic conversion passed, intake disabled. No customer responses read or sent.');
  return sample;
}


/**
 * Cloud execution of the canonical synthetic Form mapping against an ISOLATED
 * Cloudflare staging Worker and Neon development branch only.
 * No real FormResponse is created, no trigger is installed, and no customer
 * answer is read. The staging URL cannot be configured to production.
 *
 * Before first run: provision the separate staging Worker against Neon's
 * "local-development" branch. Set Script Property APEX_STAGING_INTAKE_TOKEN
 * to the separate staging Worker's INTAKE_API_SECRET (never production's).
 */
function apexTestStagingDelivery() {
  var config=apexProperties();
  if (config.getProperty('APEX_INTAKE_ENABLED') !== 'false') {
    throw new Error('Cannot test delivery while real Form intake is enabled');
  }
  var token=config.getProperty('APEX_STAGING_INTAKE_TOKEN');
  if(!token || token.length<32) throw new Error('Missing separate staging intake token');
  var url='https://apex-kennels-intake-staging.muaz-shafiq18.workers.dev/api/ingest';
  var payload=apexPreflight();
  payload.externalResponseId='apex-form-staging-synthetic-'+Utilities.getUuid();

  function send(body) {
    var response=UrlFetchApp.fetch(url,{
      method:'post',
      contentType:'application/json',
      headers:{Authorization:'Bearer '+token},
      payload:JSON.stringify(body),
      muteHttpExceptions:true,
      followRedirects:false
    });
    var status=response.getResponseCode();
    // Only read the short status fields from trusted staging responses.
    // Do not log raw response bodies, tokens, medical notes or customer data.
    var output={};
    if(status===200 || status===201) {
      try {output=JSON.parse(response.getContentText());}
      catch(_){throw new Error('Staging returned invalid JSON at HTTP '+status);}
    }
    return {status:status,created:output.created,bookingId:output.bookingId};
  }

  var first=send(payload);
  if(first.status!==201 || first.created!==true || !first.bookingId) {
    throw new Error('Staging synthetic intake failed (first request HTTP '+first.status+')');
  }
  var repeat=send(payload);
  if(repeat.status!==200 || repeat.created!==false ||
      repeat.bookingId!==first.bookingId) {
    throw new Error('Staging retry was not idempotent (HTTP '+repeat.status+')');
  }
  var changed=JSON.parse(JSON.stringify(payload));
  changed.details.medicationFeedingInstructions='Changed synthetic feeding instruction';
  var conflict=send(changed);
  if(conflict.status!==409) {
    throw new Error('Staging changed-care response did not reject with HTTP 409 (got '+conflict.status+')');
  }
  Logger.log('APEX STAGING DELIVERY PASS: 201 new / 200 same / 409 changed. Synthetic fixture ID: '+payload.externalResponseId+'. No real Form response, invoice or customer email.');
}
