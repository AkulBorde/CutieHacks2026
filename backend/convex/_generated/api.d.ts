/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assignments from "../assignments.js";
import type * as buildings from "../buildings.js";
import type * as calls from "../calls.js";
import type * as checks from "../checks.js";
import type * as http from "../http.js";
import type * as incidents from "../incidents.js";
import type * as lib_campus from "../lib/campus.js";
import type * as lib_campusPlaces from "../lib/campusPlaces.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_honesty from "../lib/honesty.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_places from "../lib/places.js";
import type * as lib_simData from "../lib/simData.js";
import type * as lib_status from "../lib/status.js";
import type * as seed from "../seed.js";
import type * as simSeed from "../simSeed.js";
import type * as simulator from "../simulator.js";
import type * as students from "../students.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assignments: typeof assignments;
  buildings: typeof buildings;
  calls: typeof calls;
  checks: typeof checks;
  http: typeof http;
  incidents: typeof incidents;
  "lib/campus": typeof lib_campus;
  "lib/campusPlaces": typeof lib_campusPlaces;
  "lib/geo": typeof lib_geo;
  "lib/honesty": typeof lib_honesty;
  "lib/phone": typeof lib_phone;
  "lib/places": typeof lib_places;
  "lib/simData": typeof lib_simData;
  "lib/status": typeof lib_status;
  seed: typeof seed;
  simSeed: typeof simSeed;
  simulator: typeof simulator;
  students: typeof students;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
