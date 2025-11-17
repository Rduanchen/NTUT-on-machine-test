import { ipcMain } from "electron";
import { Config, updateConfig, readConfig } from "./runTimeStore";
import { fetchConfig, getServerStatus } from "./api";

export class ConfigSystem {
  constructor() {
    ipcMain.handle("config:set-json", async (_event, jsonString: Config) => {
      updateConfig(jsonString);
      return { success: true };
    });
    ipcMain.handle("config:get-from-server", async (_event, host: string) => {
      try {
        let response = await fetchConfig(host);
        updateConfig(response);
        return { success: true };
      } catch (error) {
        console.error("Failed to fetch config from server:", error);
        return {
          success: false,
          messeage: "Failed to fetch config from server",
        };
      }
    });
    ipcMain.handle("config:server-status", async () => {
      const host = readConfig().remoteHost;
      try {
        let response = await getServerStatus(host);
        return { success: true, data: response };
      } catch (error) {
        console.error("Failed to fetch server status:", error);
        return { success: false, message: "Failed to fetch server status" };
      }
    });
  }
}
