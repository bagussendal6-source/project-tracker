import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { AnalysisStatus, Api } from "../src/core/api-types.ts";

const call =
  <K extends keyof Api>(name: K) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(name, ...args);

const api: Api = {
  listProjects: call("listProjects") as Api["listProjects"],
  knownProjects: call("knownProjects") as Api["knownProjects"],
  pickFolder: call("pickFolder") as Api["pickFolder"],
  addProject: call("addProject") as Api["addProject"],
  removeProject: call("removeProject") as Api["removeProject"],
  getProject: call("getProject") as Api["getProject"],
  analyze: call("analyze") as Api["analyze"],
  cancel: call("cancel") as Api["cancel"],
  statuses: call("statuses") as Api["statuses"],
  saveOverrides: call("saveOverrides") as Api["saveOverrides"],
  reveal: call("reveal") as Api["reveal"],
  openFile: call("openFile") as Api["openFile"],
  onStatus(cb) {
    const listener = (_e: IpcRendererEvent, s: AnalysisStatus) => cb(s);
    ipcRenderer.on("status", listener);
    return () => ipcRenderer.removeListener("status", listener);
  },
};

contextBridge.exposeInMainWorld("api", api);
