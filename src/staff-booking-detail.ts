import {Client} from '@neondatabase/serverless';
import type {PersonalityTrait} from './boarding-details.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function parseStaffBookingId(url:URL):string {
  const id=url.searchParams.get('id')??'';
  if(!UUID.test(id))throw new Error('Invalid booking ID');
  return id;
}
export type StaffPet={name:string;breed:string|null};
export type StaffBookingDetail={
  id:string;status:string;createdAt:string;startDate:string;endDate:string;
  customerName:string;email:string|null;phone:string|null;accommodationType:string|null;
  pets:StaffPet[];isSynthetic:boolean;hasFormDetails:boolean;
  ownerAddress:string|null;pickupDropoffRequested:boolean|null;cameraCageRequested:boolean|null;
  emergencyContactPhone:string|null;petGender:string|null;petAgeDescription:string|null;
  vaccinationStatus:string|null;distemperHistory:string|null;veterinarianPhone:string|null;
  personalityTraits:Partial<Record<PersonalityTrait,boolean>>|null;
  specialInstructions:string|null;medicationFeedingInstructions:string|null;termsAccepted:boolean|null;
};
type Row={
  id:string;status:string;created_at:string;start_date:string;end_date:string;
  customer_name:string;email:string|null;phone:string|null;accommodation_type:string|null;
  is_synthetic:boolean;has_form_details:boolean;
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
        (COALESCE(b.external_submission_id LIKE 'apex-cf-smoke-%',false)
         OR c.full_name LIKE 'APEX CANARY %'
         OR EXISTS (SELECT 1 FROM public.booking_pets cbp
                    JOIN public.pets cp ON cp.id=cbp.pet_id
                    WHERE cbp.booking_id=b.id AND cp.name='APEX SYNTHETIC CANARY PET')) AS is_synthetic,
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
      SELECT p.name,p.breed
      FROM public.booking_pets bp
      JOIN public.pets p ON p.id=bp.pet_id
      WHERE bp.booking_id=$1
      ORDER BY p.name
      LIMIT 100`,[id]);
    return {
      id:row.id,status:row.status,createdAt:row.created_at,
      startDate:row.start_date,endDate:row.end_date,
      customerName:row.customer_name,email:row.email,phone:row.phone,
      accommodationType:row.accommodation_type,pets:petRows.rows,
      isSynthetic:row.is_synthetic,hasFormDetails:row.has_form_details,
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

/** Staff-only HTML. All customer-controlled content is HTML-escaped; no data leaves the server. */
export function renderStaffBookingDetail(b:StaffBookingDetail):string {
  const petText=b.pets.length
    ? b.pets.map(p=>esc(p.name)+(p.breed?' ('+esc(p.breed)+')':'')).join(', ')
    : '<span class="missing">No linked pets</span>';
  const form=b.hasFormDetails
    ? section('Boarding & transport',
        value('Requested cage',b.cameraCageRequested===null?'<span class="missing">Not recorded</span>':b.cameraCageRequested?'Camera cage':'Standard cage')
        +value('Pickup / drop-off requested',yesNo(b.pickupDropoffRequested))
        +value('Owner address',present(b.ownerAddress))
        +value('Boarding terms accepted',yesNo(b.termsAccepted)))
      +section('Health & emergency',
        value('Vaccination status',present(b.vaccinationStatus))
        +value('Canine distemper history',present(b.distemperHistory))
        +value('Emergency contact number',present(b.emergencyContactPhone))
        +value('Vet phone number',present(b.veterinarianPhone))
        +value('Pet gender',present(b.petGender))
        +value('Pet age',present(b.petAgeDescription)))
      +section('Care instructions',
        value('Medication and feeding',present(b.medicationFeedingInstructions))
        +value('Special instructions',present(b.specialInstructions))
        +value('Owner-reported traits and health',
          Object.entries(traitLabels).map(([key,label])=>'<div class="trait">'+esc(label)
          +': <strong>'+(b.personalityTraits?.[key as PersonalityTrait]===true?'Yes':
            b.personalityTraits?.[key as PersonalityTrait]===false?'No':'Not recorded')
          +'</strong></div>').join('')
          +'<p class="fine">Yes / No reflects answers given on the form, not a medical assessment.</p>'))
    : '<section class="notice">Full boarding details are missing. Check the original Google Form before confirming this stay.</section>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
   +'<meta name="viewport" content="width=device-width,initial-scale=1">'
   +'<meta name="robots" content="noindex,nofollow"><title>Apex | Booking details</title>'
   +'<style>:root{font:14px/1.55 Inter,ui-sans-serif,system-ui,sans-serif;color:#19362b;background:#f4f6f3}'
   +'*{box-sizing:border-box}body{margin:0}.wrap{max-width:1060px;margin:36px auto;padding:0 20px}'
   +'a{color:#23644a;text-decoration:underline;text-underline-offset:3px}h1{font-size:clamp(29px,5vw,46px);letter-spacing:-.055em;line-height:1.1;margin:14px 0}'
   +'.tag{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#6c8878;font-weight:800}'
   +'.panel{background:#fff;border:1px solid #dce8df;padding:26px;margin:16px 0;border-radius:14px}'
   +'h2{font-size:17px;margin:0 0 20px;letter-spacing:-.02em}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 28px;margin:0}'
   +'.item{min-width:0}dt{font-size:11px;color:#738e7d;margin-bottom:4px}dd{margin:0;font-weight:600;white-space:pre-wrap;overflow-wrap:anywhere}'
   +'.missing,.fine{color:#8b9991;font-weight:400}.fine{font-size:12px;line-height:1.6}.trait{padding:5px 0;font-size:12px;font-weight:400}.trait strong{font-weight:700}'
   +'.banner,.notice{border-radius:10px;padding:14px 18px;margin:18px 0;border:1px solid #edd2a0;background:#fff1d8;color:#7c5623;font-size:12px;font-weight:700}'
   +'.actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.action{background:#1e4937;color:white;border-radius:8px;text-decoration:none;padding:12px 16px;font-size:12px;font-weight:700}'
   +'@media(max-width:620px){.detail-grid{grid-template-columns:1fr}.panel{padding:18px}}</style></head><body>'
   +'<main class="wrap"><a href="/staff">← Booking queue</a>'
   +'<p class="tag" style="margin-top:30px">Apex Kennels / Staff</p>'
   +'<h1>Booking details</h1>'
   +'<div class="banner">'+(b.isSynthetic?'TEST RECORD · DO NOT CONTACT':'STAFF VIEW · READ ONLY')+'</div>'
   +'<section class="panel"><h2>'+esc(b.customerName)+'</h2><dl class="detail-grid">'
   +value('Booking ID',esc(b.id))+value('Booking status',esc(b.status))
   +value('Requested dates',esc(b.startDate)+' → '+esc(b.endDate))
   +value('Received',esc(b.createdAt))
   +value('Pets',petText)
   +value('Assigned accommodation',present(b.accommodationType))
   +value('Owner phone',present(b.phone))
   +value('Owner email',present(b.email))
   +'</dl></section>'+form
   +'<div class="actions"><a class="action" href="/staff/draft?id='+encodeURIComponent(b.id)+'">Review price estimate</a>'
   +'<a href="/staff">Back to bookings</a></div>'
   +'<p class="fine">Owner-reported details. Confirm health and safety information before accepting a booking. Nothing is approved or sent from this page.</p>'
   +'</main></body></html>';
}
