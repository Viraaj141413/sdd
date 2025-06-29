import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// File-based system using VIRAAJDATA controller - no database needed
console.log("📁 Using VIRAAJDATA file-based system - no database required");

// Export dummy objects for compatibility
export const db = null;
export const pool = null;