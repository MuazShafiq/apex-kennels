import { Client } from '@neondatabase/serverless';

export const BOOKING_STATUSES = ['requested','reviewing','approved','declined','cancelled','completed'] as const;
export type BookingStatus = typeof BOOKING_STATUSES[number];
export type StaffFilter = { status: 'all' | BookingStatus; query: string };
export type StaffBooking = {
  id: string;
  status: BookingStatus;
  customerName: string;
  petNames: string;
  email: string | null;
  phone: string | null;
  startDate: string;
  endDate: string;
  accommodationType: string | null;
  createdAt: string;
  isSynthetic?: boolean;
};

export function parseStaffFilter(url: URL): StaffFilter {
  const status = url.searchParams.get('status') || 'all';
  if (status !== 'all' && !BOOKING_STATUSES.includes(status as BookingStatus)) {
    throw new Error('Invalid status filter');
  }
  const query = (url.searchParams.get('q') || '').trim();
  if (query.length > 80 || /[\u0000-\u001f\u007f]/.test(query)) {
    throw new Error('Invalid search filter');
  }
  return {status: status as StaffFilter['status'], query};
}

type RawBooking = {
  id:string; status:BookingStatus; customer_name:string; pet_names:string; email:string|null; phone:string|null;
  start_date:string; end_date:string; accommodation_type:string|null; created_at:string; is_synthetic:boolean;
};

/** A bounded, read-only staff query: no raw form payloads or financial information. */
export async function listStaffBookings(dbUrl: string, filter: StaffFilter): Promise<StaffBooking[]> {
  const client = new Client(dbUrl);
  await client.connect();
  try {
    const result = await client.query<RawBooking>(`
      SELECT b.id::text AS id, b.status,
             c.full_name AS customer_name, c.email, c.phone,
             coalesce(string_agg(DISTINCT p.name, ', '), '') AS pet_names,
             b.start_date::text AS start_date, b.end_date::text AS end_date,
             b.accommodation_type, b.created_at::text AS created_at,
             (b.external_submission_id LIKE 'apex-cf-smoke-%') AS is_synthetic
        FROM public.booking_requests b
        JOIN public.customers c ON c.id = b.customer_id
        LEFT JOIN public.booking_pets bp ON bp.booking_id = b.id
        LEFT JOIN public.pets p ON p.id = bp.pet_id
       WHERE ($1 = 'all' OR b.status = $1)
         AND ($2 = '' OR c.full_name ILIKE '%' || $2 || '%'
             OR p.name ILIKE '%' || $2 || '%')
       GROUP BY b.id, c.id
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT 50
    `,[filter.status,filter.query]);
    return result.rows.map(row=>({
      id:row.id,status:row.status,customerName:row.customer_name,petNames:row.pet_names,
      email:row.email,phone:row.phone,startDate:row.start_date,endDate:row.end_date,
      accommodationType:row.accommodation_type,createdAt:row.created_at,isSynthetic:row.is_synthetic || row.customer_name.startsWith('APEX CANARY ') || row.pet_names.includes('APEX SYNTHETIC CANARY PET')
    }));
  } finally {
    await client.end();
  }
}

/** Hard-coded sample rows are used only by /demo/staff; never mixed with database data. */
export const syntheticBookings: StaffBooking[] = [
  {id:'DEMO-001',status:'requested',customerName:'Sample Owner A',petNames:'Dog 01',email:null,phone:null,startDate:'2026-12-10',endDate:'2026-12-12',accommodationType:'Unconfirmed',createdAt:'2026-11-04'},
  {id:'DEMO-002',status:'reviewing',customerName:'Sample Owner B',petNames:'Dog 02',email:null,phone:null,startDate:'2026-12-18',endDate:'2026-12-24',accommodationType:'Unconfirmed',createdAt:'2026-11-04'},
  {id:'DEMO-003',status:'requested',customerName:'Sample Owner C',petNames:'Dog 03',email:null,phone:null,startDate:'2026-12-21',endDate:'2026-12-28',accommodationType:'Unconfirmed',createdAt:'2026-11-04'},
  {id:'DEMO-004',status:'approved',customerName:'Sample Owner D',petNames:'Dog 04',email:null,phone:null,startDate:'2026-12-02',endDate:'2026-12-05',accommodationType:'Unconfirmed',createdAt:'2026-11-04'},
];
