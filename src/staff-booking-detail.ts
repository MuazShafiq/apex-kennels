import type {SavedReview} from './staff-saved-review.ts';
import {renderStaffNav,staffNavAssets} from './staff-navigation.ts';
import type {staffDetailNavigation} from './staff-console.ts';
import {availableStayActions,readStayHistory,type StayAction,type StayEvent} from './staff-stay.ts';
import {countBilledDays} from './pricing.ts';
import {APEX_STAFF_THEME_CSS,APEX_STAFF_BRAND} from './apex-brand.ts';
import {Client} from '@neondatabase/serverless';
import {isSyntheticBooking} from './synthetic-booking.ts';
import type {BoardingDetails,PersonalityTrait} from './boarding-details.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function parseStaffBookingId(url:URL):string {
  const id=url.searchParams.get('id')??'';
  if(!UUID.test(id))throw new Error('Invalid booking ID');
  return id;
}
export type StaffPet={name:string;breed:string|null;care_details?:BoardingDetails|null};
export type StaffBookingDetail={
  id:string;status:string;createdAt:string;startDate:string;endDate:string;
  customerName:string;email:string|null;phone:string|null;accommodationType:string|null;
  stayHistory?:StayEvent[];
  pets:StaffPet[];isSynthetic:boolean;hasFormDetails:boolean;
  transportLocation?:{latitude:number;longitude:number;service:string;customerConfirmed:boolean;
    dropoffLatitude?:number|null;dropoffLongitude?:number|null}|null;
  ownerAddress:string|null;pickupDropoffRequested:boolean|null;cameraCageRequested:boolean|null;
  emergencyContactPhone:string|null;petGender:string|null;petAgeDescription:string|null;
  vaccinationStatus:string|null;distemperHistory:string|null;veterinarianPhone:string|null;
  personalityTraits:Partial<Record<PersonalityTrait,boolean>>|null;
  specialInstructions:string|null;medicationFeedingInstructions:string|null;termsAccepted:boolean|null;
};
type Row={
  id:string;status:string;created_at:string;start_date:string;end_date:string;
  customer_name:string;email:string|null;phone:string|null;accommodation_type:string|null;
  external_submission_id:string|null;has_form_details:boolean;
  owner_address:string|null;pickup_dropoff_requested:boolean|null;camera_cage_requested:boolean|null;
  emergency_contact_phone:string|null;pet_gender:string|null;pet_age_description:string|null;
  vaccination_status:string|null;distemper_history:string|null;veterinarian_phone:string|null;
  personality_traits:StaffBookingDetail['personalityTraits'];
  special_instructions:string|null;medication_feeding_instructions:string|null;terms_accepted:boolean|null;
};

/** Read ONLY the selected booking's details; never fetch raw payloads or unrelated customers. */
export async function readStaffBookingDetail(databaseUrl:string,id:string):Promise<StaffBookingDetail|null>{
  if(!UUID.test(id))throw new Error('Invalid booking ID');
  const db=new Client(databaseUrl);
  await db.connect();
  try{
    const booking=await db.query<Row>(`
      SELECT b.id::text AS id,b.status,b.created_at::text AS created_at,
        b.start_date::text AS start_date,b.end_date::text AS end_date,
        b.accommodation_type,c.full_name AS customer_name,c.email,c.phone,
        b.external_submission_id,
        (d.booking_id IS NOT NULL) AS has_form_details,
        d.owner_address,d.pickup_dropoff_requested,d.camera_cage_requested,
        d.emergency_contact_phone,d.pet_gender,d.pet_age_description,
        d.vaccination_status,d.distemper_history,d.veterinarian_phone,
        d.personality_traits,d.special_instructions,d.medication_feeding_instructions,d.terms_accepted
      FROM public.booking_requests b
      JOIN public.customers c ON c.id=b.customer_id
      LEFT JOIN public.booking_form_details d ON d.booking_id=b.id
      WHERE b.id=$1
      LIMIT 1`,[id]);
    const row=booking.rows[0];
    if(!row)return null;
    const petRows=await db.query<StaffPet>(`
      SELECT p.name,p.breed,to_jsonb(bp)->'care_details' AS care_details
      FROM public.booking_pets bp
      JOIN public.pets p ON p.id=bp.pet_id
      WHERE bp.booking_id=$1
      ORDER BY (to_jsonb(bp)->>'care_details' IS NOT NULL),p.name,p.id
      LIMIT 100`,[id]);
    let transportLocation:StaffBookingDetail['transportLocation']=null;
    try{
      const location=await db.query<{
        latitude:number;longitude:number;service:string;customer_confirmed:boolean;
        dropoff_latitude:number|null;dropoff_longitude:number|null
      }>(
        'SELECT latitude,longitude,service,customer_confirmed,dropoff_latitude,dropoff_longitude FROM public.booking_transport_locations WHERE booking_id=$1',
        [id]
      );
      if(location.rows[0]){
        const l=location.rows[0];
        transportLocation={latitude:l.latitude,longitude:l.longitude,
          service:l.service,customerConfirmed:l.customer_confirmed,
          dropoffLatitude:l.dropoff_latitude,dropoffLongitude:l.dropoff_longitude};
      }
    }catch(error){
      // Existing production still runs the original Google Form until this
      // additive table is migrated. An absent table is not a failed booking.
      if(!error||typeof error!=='object'||!('code' in error)||error.code!=='42P01')throw error;
    }
    let stayHistory:StayEvent[]|undefined;
    try{stayHistory=await readStayHistory(db,id);}
    catch(error){
      if(!error||typeof error!=='object'||!('code' in error)||error.code!=='42P01')throw error;
    }
    return {
      stayHistory,
      id:row.id,status:row.status,createdAt:row.created_at,
      startDate:row.start_date,endDate:row.end_date,
      customerName:row.customer_name,email:row.email,phone:row.phone,
      accommodationType:row.accommodation_type,pets:petRows.rows,transportLocation,
      isSynthetic:isSyntheticBooking({customerName:row.customer_name,petName:petRows.rows.map(p=>p.name).join(', '),externalResponseId:row.external_submission_id??undefined}),hasFormDetails:row.has_form_details,
      ownerAddress:row.owner_address,pickupDropoffRequested:row.pickup_dropoff_requested,
      cameraCageRequested:row.camera_cage_requested,emergencyContactPhone:row.emergency_contact_phone,
      petGender:row.pet_gender,petAgeDescription:row.pet_age_description,
      vaccinationStatus:row.vaccination_status,distemperHistory:row.distemper_history,
      veterinarianPhone:row.veterinarian_phone,personalityTraits:row.personality_traits,
      specialInstructions:row.special_instructions,
      medicationFeedingInstructions:row.medication_feeding_instructions,termsAccepted:row.terms_accepted
    };
  }finally{await db.end();}
}
const esc=(v:string):string=>v.replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]??c));
const present=(s:string|null|undefined)=>s?esc(s):'<span class="missing">Not recorded</span>';
const yesNo=(v:boolean|null)=>v===null?'<span class="missing">Not recorded</span>':v?'Yes':'No';
const traitLabels:Record<PersonalityTrait,string>={
  friendly:'Friendly',fears:'Fears / anxiety',climber:'Climber',
  foodSensitivities:'Food sensitivities',barksExcessively:'Excessive barking',
  allergies:'Allergies',biteHistory:'Bite history',medicalConditions:'Medical conditions'
};
function value(label:string,value:string):string{
  return '<div class="item"><dt>'+esc(label)+'</dt><dd>'+value+'</dd></div>';
}
function section(title:string,contents:string):string{
  return '<section class="panel"><h2>'+esc(title)+'</h2><dl class="detail-grid">'+contents+'</dl></section>';
}

const cage=(choice:boolean|null|undefined)=>typeof choice==='boolean'
  ?choice?'Camera cage':'Standard cage'
  :present(null);
const vaccination=(status:string|null|undefined)=>!status||status==='None'||status==='Partially vaccinated'
  ?present(status)+'<br><strong>Staff vaccination review required</strong>'
  :present(status);
function careTraits(traits:BoardingDetails['personalityTraits']|null):string{
  return Object.entries(traitLabels).map(([key,label])=>'<div class="trait">'+esc(label)
    +': <strong>'+yesNo(traits?.[key as PersonalityTrait]??null)+'</strong></div>').join('');
}
function renderAdditionalDog(pet:StaffPet,care:BoardingDetails):string{
  return section(pet.name,
    value('Breed',present(pet.breed))
    +value('Requested cage',cage(care.cameraCageRequested))
    +value('Vaccination status',vaccination(care.vaccinationStatus))
    +value('Canine distemper history',present(care.distemperHistory))
    +value('Vet phone number',present(care.veterinarianPhone))
    +value('Pet gender',present(care.gender))
    +value('Pet age',present(care.age))
    +value('Medication and feeding',present(care.medicationFeedingInstructions))
    +value('Special instructions',present(care.specialInstructions))
    +value('Owner-reported traits and health',careTraits(care.personalityTraits)));
}

const stayLabels:Record<StayAction,string>={
  start_review:'Start review',approve:'Approve stay',decline:'Decline stay',
  check_in:'Record check-in',check_out:'Record check-out'
};
function renderStayControls(b:StaffBookingDetail,actionQuery:string):{actions:string;history:string}{
  if(!b.stayHistory)return {actions:'',history:''};
  const history=b.stayHistory;
  const revision=history.at(-1)?.revision??0;
  const forms=availableStayActions(b.status,history).map(action=>
    '<form method="post" action="/staff/booking/action?'+esc(actionQuery)+'">'
    +'<input type="hidden" name="action" value="'+action+'">'
    +'<input type="hidden" name="revision" value="'+revision+'">'
    +'<input type="hidden" name="expectedStatus" value="'+esc(b.status)+'">'
    +(action==='approve'?'<label><input type="checkbox" name="vaccinationAttested" value="yes" required> I reviewed the vaccination status for each dog.</label>':'')
    +(action==='decline'?'<label for="decline-reason">Decline reason</label><textarea id="decline-reason" name="reason" maxlength="250" required></textarea>':'')
    +'<button class="action" type="submit">'+stayLabels[action]+'</button></form>').join('');
  const events=history.map(event=>'<li><strong>'+stayLabels[event.action]+'</strong> '
    +esc(event.recorded_at)+' · '+esc(event.actor)
    +'<br>'+esc(event.prior_status)+' → '+esc(event.new_status)
    +(event.vaccination_attested?' · Vaccination reviewed':'')
    +(event.reason?'<br>'+esc(event.reason):'')+'</li>').join('');
  return {
    actions:forms?'<section class="panel stay" id="stay-decisions"><h2>Stay decisions</h2>'+forms+'</section>':'',
    history:'<section class="panel stay" id="history"><h2>Stay history</h2>'
      +(events?'<ol>'+events+'</ol>':'<p>No stay actions recorded.</p>')+'</section>',
  };
}

/** Staff-only HTML. All customer-controlled content is HTML-escaped; no data leaves the server. */
export function renderStaffBookingDetail(b:StaffBookingDetail,navigation?:ReturnType<typeof staffDetailNavigation>,chrome?:{email:string;showTools:boolean;savedEstimate?:SavedReview|null;currentRateVersion?:number}):string {
  const petText=b.pets.length
    ? b.pets.map(p=>esc(p.name)+(p.breed?' ('+esc(p.breed)+')':'')).join(', ')
    : '<span class="missing">No linked pets</span>';
  const extraPets=b.pets.filter(pet=>pet.care_details);
  const primary=extraPets.length?b.pets.find(pet=>!pet.care_details)?.name:undefined;
  const form=b.hasFormDetails
    ? section('Boarding & transport',
        value('Pickup / drop-off requested',yesNo(b.pickupDropoffRequested))
        +value('Owner address',present(b.ownerAddress))
        +value('Boarding terms accepted',yesNo(b.termsAccepted)))
      +section(primary?primary+' · Health & emergency':'Health & emergency',
        value('Requested cage',cage(b.cameraCageRequested))
        +value('Vaccination status',vaccination(b.vaccinationStatus))
        +value('Canine distemper history',present(b.distemperHistory))
        +value('Emergency contact number',present(b.emergencyContactPhone))
        +value('Vet phone number',present(b.veterinarianPhone))
        +value('Pet gender',present(b.petGender))
        +value('Pet age',present(b.petAgeDescription)))
      +section(primary?primary+' · Care instructions':'Care instructions',
        value('Medication and feeding',present(b.medicationFeedingInstructions))
        +value('Special instructions',present(b.specialInstructions))
        +value('Owner-reported traits and health',careTraits(b.personalityTraits)))
      +extraPets.map(pet=>renderAdditionalDog(pet,pet.care_details!)).join('')
    : '<section class="notice">Full boarding details are missing. Check the original Google Form before confirming this stay.</section>';
  const location=b.transportLocation;
  const transport=location&&Number.isFinite(location.latitude)&&Number.isFinite(location.longitude)
    &&location.latitude>=23&&location.latitude<=38&&location.longitude>=60&&location.longitude<=78
    ? section('Pickup / drop-off location',
        value('Requested service',esc(location.service==='both'?'Pickup and drop-off':
          location.service==='pickup'?'Pickup only':location.service==='dropoff'?'Drop-off only':'Unknown'))
        +value(location.service==='dropoff'?'Drop-off pin':'Pickup pin',
          esc(location.latitude.toFixed(6)+', '+location.longitude.toFixed(6)))
        +value('View '+(location.service==='dropoff'?'drop-off':'pickup')+' location',
          '<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps?q='
          +encodeURIComponent(location.latitude+','+location.longitude)+'">Open in Google Maps</a>')
        +(location.service==='both'&&Number.isFinite(location.dropoffLatitude)&&Number.isFinite(location.dropoffLongitude)
          ? value('Different drop-off pin',esc(location.dropoffLatitude!.toFixed(6)+', '+location.dropoffLongitude!.toFixed(6)))
           +value('View drop-off location','<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps?q='
             +encodeURIComponent(location.dropoffLatitude+','+location.dropoffLongitude)+'">Open in Google Maps</a>')
          :location.service==='both'?value('Drop-off location','Same as pickup'): '')
      )+'<p class="fine">Check road access before confirming the transport price.</p>'
    : '';
  const bookingHref=encodeURIComponent(b.id);
  const status=b.status==='approved'&&b.stayHistory?.some(event=>event.action==='check_in')?'Checked in':
    b.status==='reviewing'?'In review':b.status.charAt(0).toUpperCase()+b.status.slice(1);
  const latest=b.stayHistory?.at(-1);
  let days:number|undefined;
  try{days=countBilledDays(b.startDate,b.endDate,'inclusive_days');}
  catch{/* Show the stored dates even when a historical record is invalid. */}
  const controls=renderStayControls(b,navigation?.actionQuery??new URLSearchParams({id:b.id}).toString());
  const saved=chrome?.savedEstimate;
  const savedVersion=saved?.snapshot.pricingSnapshot?.rateCardVersion;
  const currentVersion=chrome?.currentRateVersion;
  const estimate='<section class="panel estimate" id="estimate"><h2>Estimate &amp; invoice</h2>'
    +(saved?'<p>Saved revision '+saved.revision+' · PKR '+saved.snapshot.quote.totalPkr.toLocaleString('en-PK')+'</p>'
      +'<p>'+(savedVersion===undefined?'Saved before versioned rate cards.':'Saved on rate card version '+savedVersion+'.')
      +(currentVersion===undefined?'':' Re-saving uses version '+currentVersion+' and creates a new revision.')+'</p>'
      +'<p><a href="/staff/draft/saved.pdf?id='+bookingHref+'">Open saved estimate PDF</a></p>'
      :'<p>Review boarding rates and saved pricing for this stay.</p>')
    +'<a class="action" href="/staff/draft?id='+bookingHref+'">Review price estimate</a></section>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
   +'<meta name="viewport" content="width=device-width,initial-scale=1">'
   +'<meta name="robots" content="noindex,nofollow"><title>Apex | Booking details</title>'
   +(chrome?staffNavAssets:'')+'<style>:root{font:14px/1.55 Apex Inter Tight,Inter,ui-sans-serif,system-ui,sans-serif;color:#19362b;background:#f4f6f3}'
   +'*{box-sizing:border-box}body{margin:0}.wrap{max-width:1060px;margin:36px auto;padding:0 20px}'
   +'a{color:#23644a;text-decoration:underline;text-underline-offset:3px}h1{font-size:clamp(29px,5vw,46px);letter-spacing:-.055em;line-height:1.1;margin:14px 0}'
   +'.tag{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#6c8878;font-weight:800}'
   +'.panel{background:#fff;border:1px solid #dce8df;padding:26px;margin:16px 0;border-radius:14px}'
   +'h2{font-size:17px;margin:0 0 20px;letter-spacing:-.02em}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 28px;margin:0}'
   +'.item{min-width:0}dt{font-size:11px;color:#738e7d;margin-bottom:4px}dd{margin:0;font-weight:600;white-space:pre-wrap;overflow-wrap:anywhere}'
   +'.missing,.fine{color:#8b9991;font-weight:400}.fine{font-size:12px;line-height:1.6}.trait{padding:5px 0;font-size:12px;font-weight:400}.trait strong{font-weight:700}'
   +'.banner,.notice{border-radius:10px;padding:14px 18px;margin:18px 0;border:1px solid #edd2a0;background:#fff1d8;color:#7c5623;font-size:12px;font-weight:700}'
   +'.actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.action{background:#1e4937;color:white;border-radius:8px;text-decoration:none;padding:12px 16px;font-size:12px;font-weight:700}'
   +'.stay form{display:grid;justify-items:start;gap:10px;margin:12px 0}.stay textarea{width:min(100%,420px);min-height:65px}.stay button{cursor:pointer;border:0;min-height:44px}.stay li{overflow-wrap:anywhere;margin:8px 0}'
   +'@media(max-width:620px){.detail-grid{grid-template-columns:1fr}.panel{padding:18px}}'+APEX_STAFF_THEME_CSS
   +'.detail-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(230px,300px);gap:16px;margin-top:20px}.detail-hero .panel{margin:0}.nameplate{border-radius:16px;background:#120709 url(/site/v106/raven-plaque-texture.webp) center/cover;background-blend-mode:screen;color:#fff;padding:clamp(20px,4vw,38px);overflow-wrap:anywhere}.nameplate h1{color:#fff;margin:8px 0}.nameplate .tag{color:#bfe3f4}.nameplate .chip{display:inline-block;background:#bfe3f4;color:#120709;border-radius:8px;padding:4px 9px;font-weight:750}.nameplate p{margin:9px 0 0}.estimate p{margin:0 0 12px}.detail-nav{display:flex;flex-wrap:wrap;gap:8px;margin:15px 0}.detail-nav a{display:inline-flex;align-items:center;min-height:44px;padding:6px 11px;border-radius:8px;background:#eef6fa;color:#120709}.stay-dates{border-bottom:2px solid #fd6e6e;padding-bottom:10px}.detail-hero .action,.actions .action{display:inline-flex;align-items:center;min-height:44px;background:#120709;color:#fff}section[id],aside[id]{scroll-margin-top:12px}@media(max-width:700px){.detail-hero{grid-template-columns:1fr}}'
   +'.detail-tabs a{border:1px solid #82797d;background:#fff;text-decoration:none;font-weight:750;padding:6px 13px}.detail-tabs a[aria-selected=true]{color:#fff;background:#120709;border-color:#120709}.detail-tabs [hidden],[role=tabpanel][hidden]{display:none}'
   +'</style></head><body>'
   +(chrome?renderStaffNav('run',chrome.showTools,chrome.email):'')+'<main class="wrap">'+(chrome?'':APEX_STAFF_BRAND)+'<nav class="detail-nav" aria-label="Run sheet navigation">'
   +'<a href="'+esc(navigation?.back??('/staff?stay='+bookingHref+'#selected-stay'))+'">← Run sheet</a>'
   +(navigation?.position?'<span>'+esc(navigation.position)+'</span>':'')
   +(navigation?.previous?'<a href="'+esc(navigation.previous.href)+'">Previous: '+esc(navigation.previous.name)+'</a>':'')
   +(navigation?.next?'<a href="'+esc(navigation.next.href)+'">Next: '+esc(navigation.next.name)+'</a>':'')+'</nav>'
   +'<div class="detail-hero"><header class="nameplate"><span class="tag">Booking details · '+esc(b.id.slice(0,8))+'</span>'
   +'<h1>'+petText+'</h1><p><span class="chip">'+esc(status)+'</span>'
   +(latest?' '+esc(stayLabels[latest.action])+' · '+esc(latest.recorded_at):'')+'</p>'
   +'<p>Owner '+esc(b.customerName)+'</p></header>'
   +'<aside class="panel estimate"><h2>Next step</h2><p>'+(
     b.status==='requested'?'Start the stay review.':b.status==='reviewing'?'Review boarding details and vaccination for each dog.'
     :(b.pickupDropoffRequested?'Check the confirmed gates before pricing transport.':'Review the estimate for this stay.')
   )+'</p><a href="'+(b.status==='requested'||b.status==='reviewing'?'#overview':b.pickupDropoffRequested?'#transport':'#estimate')+'">'
   +'Open next step</a></aside></div>'
   +(b.isSynthetic?'<div class="banner">TEST RECORD · DO NOT CONTACT</div>':'')
   +'<p class="stay-dates">'+esc(b.startDate)+' → '+esc(b.endDate)+(days?' · '+days+(days===1?' billed day':' billed days'):'')+'</p>'
   +'<nav class="detail-nav detail-tabs" data-detail-tabs aria-label="Booking sections"><a href="#overview">Overview</a><a href="#transport">Transport</a>'
   +'<a href="#estimate">Estimate &amp; invoice</a>'+(b.stayHistory?'<a href="#history">History</a>':'')+'</nav>'
   +'<div id="overview"><section class="panel"><h2>Owner &amp; booking</h2><dl class="detail-grid">'
   +value('Booking ID',esc(b.id))
   +value('Received',esc(b.createdAt))
   +value('Pets',petText)
   +value('Assigned accommodation',present(b.accommodationType))
   +value('Owner phone',present(b.phone))
   +value('Owner email',present(b.email))
   +'</dl></section>'+form+controls.actions
   +'<p class="fine">Health and care details came from the owner. Confirm anything unclear before accepting the booking.</p></div>'
   +'<div id="transport">'+(transport||section('Transport',value('Requested transport',yesNo(b.pickupDropoffRequested))))
   +(b.pickupDropoffRequested===true||b.transportLocation
     ?'<div class="actions"><a class="action" href="/staff/transport?id='+bookingHref+'">Price pickup / drop-off</a></div>':'')+'</div>'
   +estimate+controls.history
   +'</main></body></html>';
}
