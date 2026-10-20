// Hitung ongkir lewat Edge Function shipping-cost (berat dihitung server dari varian + qty; kunci API tidak ada di browser).
import { invokeFn } from "./api.js";

/** @returns {Promise<{weight_gram:number,courier:string,services:Array<{service:string,description:?string,cost:number,etd:?string}>,cached:boolean,stale:boolean,fetched_at:string}>} */
export const getShippingRates = ({ destination, courier, items, fresh = false }) =>
  invokeFn("shipping-cost", { destination: String(destination), courier, items, ...(fresh ? { fresh: true } : {}) });
