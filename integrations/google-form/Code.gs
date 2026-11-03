/**
 * Apex Kennels, FORM-BOUND installable trigger adapter.
 * Not installed and disabled by default. Requires access to Fatima's actual Form.
 * Google response ITEM IDs are used instead of fragile question titles.
 *
 * Required Script Properties:
 *   APEX_INTAKE_ENABLED = true                (leave false until reviewed)
 *   APEX_API_URL = https://<your-host>/api/ingest
 *   APEX_INTAKE_TOKEN = <secret copied securely from backend settings>
 *   APEX_FIELD_MAP = JSON object of field names -> Google Form ITEM IDs
 *
 * Optional, if keeping Vercel deployment protection for Google Apps Script:
 *   APEX_VERCEL_BYPASS = <deployment protection automation bypass secret>
 *
 * Create an installable Form submit trigger pointing to onApexFormSubmit.
 */
function onApexFormSubmit(e) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('APEX_INTAKE_ENABLED') !== 'true') return;
  if (!e || !e.response) throw new Error('Requires Google Form submission event, not Sheet event');

  var url = props.getProperty('APEX_API_URL');
  var token = props.getProperty('APEX_INTAKE_TOKEN');
  var mapRaw = props.getProperty('APEX_FIELD_MAP');
  if (!url || !token || !mapRaw) throw new Error('Apex integration properties incomplete');

  var fieldMap = JSON.parse(mapRaw);
  var valuesByItemId = {};
  e.response.getItemResponses().forEach(function (answer) {
    valuesByItemId[String(answer.getItem().getId())] = answer.getResponse();
  });

  function answerFor(name) {
    var itemId = fieldMap[name];
    if (!itemId) return undefined;
    var value = valuesByItemId[String(itemId)];
    if (value === null || value === undefined || value === '') return undefined;
    if (value instanceof Date) {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    if (Array.isArray(value)) return value.join(', ');
    return String(value).trim();
  }

  var formResponseId = e.response.getId();
  if (!formResponseId) throw new Error('Google Form response has no stable ID');

  var data = {
    source: 'google_form',
    externalResponseId: String(formResponseId),
    customerName: answerFor('customerName'),
    email: answerFor('email') || e.response.getRespondentEmail() || undefined,
    phone: answerFor('phone'),
    petName: answerFor('petName'),
    startDate: answerFor('startDate'),
    endDate: answerFor('endDate'),
    accommodationType: answerFor('accommodationType')
  };

  var headers = {Authorization: 'Bearer ' + token};
  var bypass = props.getProperty('APEX_VERCEL_BYPASS');
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(data),
    muteHttpExceptions: true,
    followRedirects: false
  });
  var status = response.getResponseCode();
  if (status !== 200 && status !== 201) {
    // Never log pet names, customer details, tokens, or raw response bodies.
    throw new Error('Apex intake request failed: HTTP ' + status);
  }
}

/** Safe helper: lists only Form item IDs + question titles for mapping. */
function listApexFormItemIds() {
  var form = FormApp.getActiveForm();
  if (!form) throw new Error('Run in the bound Form Apps Script editor');
  var items = form.getItems().map(function (item) {
    return {id: String(item.getId()), title: item.getTitle()};
  });
  Logger.log(JSON.stringify(items));
}
