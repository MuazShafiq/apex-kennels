/** Retired search namespace compatibility. Keep the deployed class/migration identity.
 * No caller, provider requests, state access or writes. Do not delete persisted
 * objects as cleanup; a future namespace retirement needs a reviewed migration.
 */
export class LocationSearchBudget {
  async fetch(_request:Request):Promise<Response>{
    return new Response('Retired',{status:410,headers:{'Cache-Control':'no-store'}});
  }
}
