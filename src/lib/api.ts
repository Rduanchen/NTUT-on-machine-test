import axios from "axios";
import { Config, readConfig } from "./runTimeStore";

export async function fetchConfig(host: string) {
  try {
    const response = await axios.get(`${host}/api/get-config`);
    return response.data as Config;
  } catch (error) {
    console.error("Failed to fetch config:", error);
    throw error;
  }
}

export async function getServerStatus(host: string) {
  try {
    const response = await axios.get(`${host}/api/status`);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch server status:", error);
    throw error;
  }
}
