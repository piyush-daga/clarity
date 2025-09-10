/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "(ssr)/./workers/db.worker.ts":
/*!******************************!*\
  !*** ./workers/db.worker.ts ***!
  \******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _sqlite_org_sqlite_wasm__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @sqlite.org/sqlite-wasm */ \"(ssr)/./node_modules/@sqlite.org/sqlite-wasm/node.mjs\");\n/* eslint-disable no-restricted-globals */ \nlet db = null;\nlet sqlite3 = null;\nasync function ensureDB() {\n    if (db) return db;\n    if (!sqlite3) {\n        sqlite3 = await (0,_sqlite_org_sqlite_wasm__WEBPACK_IMPORTED_MODULE_0__[\"default\"])({});\n    }\n    try {\n        db = new sqlite3.oo1.OpfsDb('/clarity/main.sqlite3');\n    } catch (e) {\n        // Fallback to transient db if OPFS unavailable\n        db = new sqlite3.oo1.DB('/clarity/main.sqlite3', 'ct');\n    }\n    return db;\n}\nfunction migrateSQL() {\n    return `\nCREATE TABLE IF NOT EXISTS calendars (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  enabled INTEGER NOT NULL DEFAULT 1,\n  kind TEXT NOT NULL CHECK(kind IN ('local','google')),\n  readOnly INTEGER NOT NULL DEFAULT 0\n);\n\nCREATE TABLE IF NOT EXISTS tasks (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  description TEXT,\n  stage TEXT NOT NULL CHECK(stage IN ('todo','in-progress','done')),\n  checked INTEGER NOT NULL DEFAULT 0,\n  start TEXT,\n  end TEXT,\n  allDay INTEGER,\n  isEvent INTEGER NOT NULL DEFAULT 0,\n  hiddenOnCalendar INTEGER NOT NULL DEFAULT 0,\n  linkedTo TEXT,\n  parentId TEXT,\n  subTasks TEXT,\n  createdAt TEXT NOT NULL,\n  updatedAt TEXT NOT NULL,\n  calendarId TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,\n  sortOrder REAL NOT NULL DEFAULT 0\n);\n\nCREATE INDEX IF NOT EXISTS idx_tasks_stage ON tasks(stage);\nCREATE INDEX IF NOT EXISTS idx_tasks_calendar ON tasks(calendarId);\nCREATE INDEX IF NOT EXISTS idx_tasks_time ON tasks(start, end);\n\nINSERT OR IGNORE INTO calendars(id,title,enabled,kind,readOnly)\nVALUES ('local','Local Tasks',1,'local',0);\n`;\n}\nself.onmessage = async (e)=>{\n    const msg = e.data;\n    const send = (res)=>self.postMessage(res);\n    try {\n        switch(msg.type){\n            case 'init':\n                {\n                    await ensureDB();\n                    send({\n                        id: msg.id,\n                        ok: true\n                    });\n                    break;\n                }\n            case 'migrate':\n                {\n                    const dbi = await ensureDB();\n                    dbi.exec(migrateSQL());\n                    // Attempt to migrate old column name 'order' -> 'sortOrder'\n                    try {\n                        dbi.exec('ALTER TABLE tasks RENAME COLUMN \"order\" TO sortOrder;');\n                    } catch (_) {\n                    // ignore if not present or already migrated\n                    }\n                    // If legacy 'color' column exists, rebuild table without it\n                    try {\n                        const cols = dbi.exec({\n                            sql: 'PRAGMA table_info(tasks);',\n                            returnValue: 'resultRows',\n                            rowMode: 'object'\n                        });\n                        const hasColor = Array.isArray(cols) && cols.some((r)=>String(r.name || '') === 'color');\n                        if (hasColor) {\n                            dbi.exec('BEGIN;');\n                            dbi.exec(`\nCREATE TABLE IF NOT EXISTS tasks__new (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  description TEXT,\n  stage TEXT NOT NULL CHECK(stage IN ('todo','in-progress','done')),\n  checked INTEGER NOT NULL DEFAULT 0,\n  start TEXT,\n  end TEXT,\n  allDay INTEGER,\n  isEvent INTEGER NOT NULL DEFAULT 0,\n  hiddenOnCalendar INTEGER NOT NULL DEFAULT 0,\n  linkedTo TEXT,\n  parentId TEXT,\n  subTasks TEXT,\n  createdAt TEXT NOT NULL,\n  updatedAt TEXT NOT NULL,\n  calendarId TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,\n  sortOrder REAL NOT NULL DEFAULT 0\n);\n`);\n                            dbi.exec(`INSERT INTO tasks__new (id,title,description,stage,checked,start,end,allDay,isEvent,hiddenOnCalendar,linkedTo,parentId,subTasks,createdAt,updatedAt,calendarId,sortOrder)\nSELECT id,title,description,stage,checked,start,end,allDay,isEvent,hiddenOnCalendar,linkedTo,parentId,subTasks,createdAt,updatedAt,calendarId,sortOrder FROM tasks;`);\n                            dbi.exec('DROP TABLE tasks;');\n                            dbi.exec('ALTER TABLE tasks__new RENAME TO tasks;');\n                            dbi.exec('CREATE INDEX IF NOT EXISTS idx_tasks_stage ON tasks(stage);');\n                            dbi.exec('CREATE INDEX IF NOT EXISTS idx_tasks_calendar ON tasks(calendarId);');\n                            dbi.exec('CREATE INDEX IF NOT EXISTS idx_tasks_time ON tasks(start, end);');\n                            dbi.exec('COMMIT;');\n                        }\n                    } catch (_) {\n                        try {\n                            dbi.exec('ROLLBACK;');\n                        } catch  {}\n                    }\n                    send({\n                        id: msg.id,\n                        ok: true\n                    });\n                    break;\n                }\n            case 'run':\n                {\n                    const dbi = await ensureDB();\n                    dbi.exec({\n                        sql: msg.sql,\n                        bind: msg.params ?? []\n                    });\n                    send({\n                        id: msg.id,\n                        ok: true\n                    });\n                    break;\n                }\n            case 'all':\n                {\n                    const dbi = await ensureDB();\n                    const rows = dbi.exec({\n                        sql: msg.sql,\n                        bind: msg.params ?? [],\n                        returnValue: 'resultRows',\n                        rowMode: 'object'\n                    });\n                    send({\n                        id: msg.id,\n                        ok: true,\n                        result: rows\n                    });\n                    break;\n                }\n        }\n    } catch (err) {\n        const error = err instanceof Error ? err.message : String(err);\n        send({\n            id: msg.id,\n            ok: false,\n            error\n        });\n    }\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,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SUFBSSxFQUFFO3dCQUN0QlYsYUFBYTt3QkFDYkMsU0FBUztvQkFDWDtvQkFDQVosS0FBSzt3QkFBRUksSUFBSU4sSUFBSU0sRUFBRTt3QkFBRUMsSUFBSTt3QkFBTWtCLFFBQVFEO29CQUFLO29CQUMxQztnQkFDRjtRQUNGO0lBQ0YsRUFBRSxPQUFPRSxLQUFjO1FBQ3JCLE1BQU1DLFFBQVFELGVBQWVFLFFBQVFGLElBQUlHLE9BQU8sR0FBR1QsT0FBT007UUFDMUR4QixLQUFLO1lBQUVJLElBQUlOLElBQUlNLEVBQUU7WUFBRUMsSUFBSTtZQUFPb0I7UUFBTTtJQUN0QztBQUNGIiwic291cmNlcyI6WyIvVXNlcnMvcGl5dXNoLmRhZ2FAcG9zdG1hbi5jb20vRG9jdW1lbnRzL1Byb2plY3RzL3BpeXVzaC1kYWdhL2V2YS0yL3Nlc3Npb24xLWJ1aWxkLXRvZG8tY2FsZW5kYXIvd29ya2Vycy9kYi53b3JrZXIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50LWRpc2FibGUgbm8tcmVzdHJpY3RlZC1nbG9iYWxzICovXG5pbXBvcnQgc3FsaXRlM0luaXRNb2R1bGUgZnJvbSAnQHNxbGl0ZS5vcmcvc3FsaXRlLXdhc20nO1xuXG50eXBlIE1lc3NhZ2UgPVxuICB8IHsgaWQ6IHN0cmluZzsgdHlwZTogJ2luaXQnIH1cbiAgfCB7IGlkOiBzdHJpbmc7IHR5cGU6ICdtaWdyYXRlJyB9XG4gIHwgeyBpZDogc3RyaW5nOyB0eXBlOiAncnVuJzsgc3FsOiBzdHJpbmc7IHBhcmFtcz86IHVua25vd25bXSB9XG4gIHwgeyBpZDogc3RyaW5nOyB0eXBlOiAnYWxsJzsgc3FsOiBzdHJpbmc7IHBhcmFtcz86IHVua25vd25bXSB9O1xuXG50eXBlIFJlc3BvbnNlID1cbiAgfCB7IGlkOiBzdHJpbmc7IG9rOiB0cnVlOyByZXN1bHQ/OiB1bmtub3duIH1cbiAgfCB7IGlkOiBzdHJpbmc7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9O1xuXG5sZXQgZGI6IGFueSA9IG51bGw7XG5sZXQgc3FsaXRlMzogYW55ID0gbnVsbDtcblxuYXN5bmMgZnVuY3Rpb24gZW5zdXJlREIoKSB7XG4gIGlmIChkYikgcmV0dXJuIGRiO1xuICBpZiAoIXNxbGl0ZTMpIHtcbiAgICBzcWxpdGUzID0gYXdhaXQgc3FsaXRlM0luaXRNb2R1bGUoe30pO1xuICB9XG4gIHRyeSB7XG4gICAgZGIgPSBuZXcgc3FsaXRlMy5vbzEuT3Bmc0RiKCcvY2xhcml0eS9tYWluLnNxbGl0ZTMnKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIC8vIEZhbGxiYWNrIHRvIHRyYW5zaWVudCBkYiBpZiBPUEZTIHVuYXZhaWxhYmxlXG4gICAgZGIgPSBuZXcgc3FsaXRlMy5vbzEuREIoJy9jbGFyaXR5L21haW4uc3FsaXRlMycsICdjdCcpO1xuICB9XG4gIHJldHVybiBkYjtcbn1cblxuZnVuY3Rpb24gbWlncmF0ZVNRTCgpOiBzdHJpbmcge1xuICByZXR1cm4gYFxuQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgY2FsZW5kYXJzIChcbiAgaWQgVEVYVCBQUklNQVJZIEtFWSxcbiAgdGl0bGUgVEVYVCBOT1QgTlVMTCxcbiAgZW5hYmxlZCBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMSxcbiAga2luZCBURVhUIE5PVCBOVUxMIENIRUNLKGtpbmQgSU4gKCdsb2NhbCcsJ2dvb2dsZScpKSxcbiAgcmVhZE9ubHkgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDBcbik7XG5cbkNSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHRhc2tzIChcbiAgaWQgVEVYVCBQUklNQVJZIEtFWSxcbiAgdGl0bGUgVEVYVCBOT1QgTlVMTCxcbiAgZGVzY3JpcHRpb24gVEVYVCxcbiAgc3RhZ2UgVEVYVCBOT1QgTlVMTCBDSEVDSyhzdGFnZSBJTiAoJ3RvZG8nLCdpbi1wcm9ncmVzcycsJ2RvbmUnKSksXG4gIGNoZWNrZWQgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsXG4gIHN0YXJ0IFRFWFQsXG4gIGVuZCBURVhULFxuICBhbGxEYXkgSU5URUdFUixcbiAgaXNFdmVudCBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMCxcbiAgaGlkZGVuT25DYWxlbmRhciBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMCxcbiAgbGlua2VkVG8gVEVYVCxcbiAgcGFyZW50SWQgVEVYVCxcbiAgc3ViVGFza3MgVEVYVCxcbiAgY3JlYXRlZEF0IFRFWFQgTk9UIE5VTEwsXG4gIHVwZGF0ZWRBdCBURVhUIE5PVCBOVUxMLFxuICBjYWxlbmRhcklkIFRFWFQgTk9UIE5VTEwgUkVGRVJFTkNFUyBjYWxlbmRhcnMoaWQpIE9OIERFTEVURSBDQVNDQURFLFxuICBzb3J0T3JkZXIgUkVBTCBOT1QgTlVMTCBERUZBVUxUIDBcbik7XG5cbkNSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF90YXNrc19zdGFnZSBPTiB0YXNrcyhzdGFnZSk7XG5DUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfdGFza3NfY2FsZW5kYXIgT04gdGFza3MoY2FsZW5kYXJJZCk7XG5DUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfdGFza3NfdGltZSBPTiB0YXNrcyhzdGFydCwgZW5kKTtcblxuSU5TRVJUIE9SIElHTk9SRSBJTlRPIGNhbGVuZGFycyhpZCx0aXRsZSxlbmFibGVkLGtpbmQscmVhZE9ubHkpXG5WQUxVRVMgKCdsb2NhbCcsJ0xvY2FsIFRhc2tzJywxLCdsb2NhbCcsMCk7XG5gO1xufVxuXG5zZWxmLm9ubWVzc2FnZSA9IGFzeW5jIChlOiBNZXNzYWdlRXZlbnQ8TWVzc2FnZT4pID0+IHtcbiAgY29uc3QgbXNnID0gZS5kYXRhO1xuICBjb25zdCBzZW5kID0gKHJlczogUmVzcG9uc2UpID0+IChzZWxmIGFzIHVua25vd24gYXMgV29ya2VyKS5wb3N0TWVzc2FnZShyZXMpO1xuICB0cnkge1xuICAgIHN3aXRjaCAobXNnLnR5cGUpIHtcbiAgICAgIGNhc2UgJ2luaXQnOiB7XG4gICAgICAgIGF3YWl0IGVuc3VyZURCKCk7XG4gICAgICAgIHNlbmQoeyBpZDogbXNnLmlkLCBvazogdHJ1ZSB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdtaWdyYXRlJzoge1xuICAgICAgICBjb25zdCBkYmkgPSBhd2FpdCBlbnN1cmVEQigpO1xuICAgICAgICBkYmkuZXhlYyhtaWdyYXRlU1FMKCkpO1xuICAgICAgICAvLyBBdHRlbXB0IHRvIG1pZ3JhdGUgb2xkIGNvbHVtbiBuYW1lICdvcmRlcicgLT4gJ3NvcnRPcmRlcidcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBkYmkuZXhlYygnQUxURVIgVEFCTEUgdGFza3MgUkVOQU1FIENPTFVNTiBcIm9yZGVyXCIgVE8gc29ydE9yZGVyOycpO1xuICAgICAgICB9IGNhdGNoIChfKSB7XG4gICAgICAgICAgLy8gaWdub3JlIGlmIG5vdCBwcmVzZW50IG9yIGFscmVhZHkgbWlncmF0ZWRcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiBsZWdhY3kgJ2NvbG9yJyBjb2x1bW4gZXhpc3RzLCByZWJ1aWxkIHRhYmxlIHdpdGhvdXQgaXRcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb2xzID0gZGJpLmV4ZWMoeyBzcWw6ICdQUkFHTUEgdGFibGVfaW5mbyh0YXNrcyk7JywgcmV0dXJuVmFsdWU6ICdyZXN1bHRSb3dzJywgcm93TW9kZTogJ29iamVjdCcgfSkgYXMgYW55W107XG4gICAgICAgICAgY29uc3QgaGFzQ29sb3IgPSBBcnJheS5pc0FycmF5KGNvbHMpICYmIGNvbHMuc29tZSgocikgPT4gU3RyaW5nKChyIGFzIGFueSkubmFtZSB8fCAnJykgPT09ICdjb2xvcicpO1xuICAgICAgICAgIGlmIChoYXNDb2xvcikge1xuICAgICAgICAgICAgZGJpLmV4ZWMoJ0JFR0lOOycpO1xuICAgICAgICAgICAgZGJpLmV4ZWMoYFxuQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgdGFza3NfX25ldyAoXG4gIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gIHRpdGxlIFRFWFQgTk9UIE5VTEwsXG4gIGRlc2NyaXB0aW9uIFRFWFQsXG4gIHN0YWdlIFRFWFQgTk9UIE5VTEwgQ0hFQ0soc3RhZ2UgSU4gKCd0b2RvJywnaW4tcHJvZ3Jlc3MnLCdkb25lJykpLFxuICBjaGVja2VkIElOVEVHRVIgTk9UIE5VTEwgREVGQVVMVCAwLFxuICBzdGFydCBURVhULFxuICBlbmQgVEVYVCxcbiAgYWxsRGF5IElOVEVHRVIsXG4gIGlzRXZlbnQgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsXG4gIGhpZGRlbk9uQ2FsZW5kYXIgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsXG4gIGxpbmtlZFRvIFRFWFQsXG4gIHBhcmVudElkIFRFWFQsXG4gIHN1YlRhc2tzIFRFWFQsXG4gIGNyZWF0ZWRBdCBURVhUIE5PVCBOVUxMLFxuICB1cGRhdGVkQXQgVEVYVCBOT1QgTlVMTCxcbiAgY2FsZW5kYXJJZCBURVhUIE5PVCBOVUxMIFJFRkVSRU5DRVMgY2FsZW5kYXJzKGlkKSBPTiBERUxFVEUgQ0FTQ0FERSxcbiAgc29ydE9yZGVyIFJFQUwgTk9UIE5VTEwgREVGQVVMVCAwXG4pO1xuYCk7XG4gICAgICAgICAgICBkYmkuZXhlYyhgSU5TRVJUIElOVE8gdGFza3NfX25ldyAoaWQsdGl0bGUsZGVzY3JpcHRpb24sc3RhZ2UsY2hlY2tlZCxzdGFydCxlbmQsYWxsRGF5LGlzRXZlbnQsaGlkZGVuT25DYWxlbmRhcixsaW5rZWRUbyxwYXJlbnRJZCxzdWJUYXNrcyxjcmVhdGVkQXQsdXBkYXRlZEF0LGNhbGVuZGFySWQsc29ydE9yZGVyKVxuU0VMRUNUIGlkLHRpdGxlLGRlc2NyaXB0aW9uLHN0YWdlLGNoZWNrZWQsc3RhcnQsZW5kLGFsbERheSxpc0V2ZW50LGhpZGRlbk9uQ2FsZW5kYXIsbGlua2VkVG8scGFyZW50SWQsc3ViVGFza3MsY3JlYXRlZEF0LHVwZGF0ZWRBdCxjYWxlbmRhcklkLHNvcnRPcmRlciBGUk9NIHRhc2tzO2ApO1xuICAgICAgICAgICAgZGJpLmV4ZWMoJ0RST1AgVEFCTEUgdGFza3M7Jyk7XG4gICAgICAgICAgICBkYmkuZXhlYygnQUxURVIgVEFCTEUgdGFza3NfX25ldyBSRU5BTUUgVE8gdGFza3M7Jyk7XG4gICAgICAgICAgICBkYmkuZXhlYygnQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaWR4X3Rhc2tzX3N0YWdlIE9OIHRhc2tzKHN0YWdlKTsnKTtcbiAgICAgICAgICAgIGRiaS5leGVjKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfdGFza3NfY2FsZW5kYXIgT04gdGFza3MoY2FsZW5kYXJJZCk7Jyk7XG4gICAgICAgICAgICBkYmkuZXhlYygnQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaWR4X3Rhc2tzX3RpbWUgT04gdGFza3Moc3RhcnQsIGVuZCk7Jyk7XG4gICAgICAgICAgICBkYmkuZXhlYygnQ09NTUlUOycpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHRyeSB7IGRiaS5leGVjKCdST0xMQkFDSzsnKTsgfSBjYXRjaCB7fVxuICAgICAgICB9XG4gICAgICAgIHNlbmQoeyBpZDogbXNnLmlkLCBvazogdHJ1ZSB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdydW4nOiB7XG4gICAgICAgIGNvbnN0IGRiaSA9IGF3YWl0IGVuc3VyZURCKCk7XG4gICAgICAgIGRiaS5leGVjKHsgc3FsOiBtc2cuc3FsLCBiaW5kOiBtc2cucGFyYW1zID8/IFtdIH0pO1xuICAgICAgICBzZW5kKHsgaWQ6IG1zZy5pZCwgb2s6IHRydWUgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnYWxsJzoge1xuICAgICAgICBjb25zdCBkYmkgPSBhd2FpdCBlbnN1cmVEQigpO1xuICAgICAgICBjb25zdCByb3dzID0gZGJpLmV4ZWMoe1xuICAgICAgICAgIHNxbDogbXNnLnNxbCxcbiAgICAgICAgICBiaW5kOiBtc2cucGFyYW1zID8/IFtdLFxuICAgICAgICAgIHJldHVyblZhbHVlOiAncmVzdWx0Um93cycsXG4gICAgICAgICAgcm93TW9kZTogJ29iamVjdCcsXG4gICAgICAgIH0pO1xuICAgICAgICBzZW5kKHsgaWQ6IG1zZy5pZCwgb2s6IHRydWUsIHJlc3VsdDogcm93cyB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9IGNhdGNoIChlcnI6IHVua25vd24pIHtcbiAgICBjb25zdCBlcnJvciA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcbiAgICBzZW5kKHsgaWQ6IG1zZy5pZCwgb2s6IGZhbHNlLCBlcnJvciB9KTtcbiAgfVxufTtcbiJdLCJuYW1lcyI6WyJzcWxpdGUzSW5pdE1vZHVsZSIsImRiIiwic3FsaXRlMyIsImVuc3VyZURCIiwib28xIiwiT3Bmc0RiIiwiZSIsIkRCIiwibWlncmF0ZVNRTCIsInNlbGYiLCJvbm1lc3NhZ2UiLCJtc2ciLCJkYXRhIiwic2VuZCIsInJlcyIsInBvc3RNZXNzYWdlIiwidHlwZSIsImlkIiwib2siLCJkYmkiLCJleGVjIiwiXyIsImNvbHMiLCJzcWwiLCJyZXR1cm5WYWx1ZSIsInJvd01vZGUiLCJoYXNDb2xvciIsIkFycmF5IiwiaXNBcnJheSIsInNvbWUiLCJyIiwiU3RyaW5nIiwibmFtZSIsImJpbmQiLCJwYXJhbXMiLCJyb3dzIiwicmVzdWx0IiwiZXJyIiwiZXJyb3IiLCJFcnJvciIsIm1lc3NhZ2UiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/./workers/db.worker.ts\n");

/***/ }),

/***/ "module":
/*!*************************!*\
  !*** external "module" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("module");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = __webpack_modules__;
/******/ 	
/******/ 	// the startup function
/******/ 	__webpack_require__.x = () => {
/******/ 		// Load entry module and return exports
/******/ 		// This entry module depends on other loaded chunks and execution need to be delayed
/******/ 		var __webpack_exports__ = __webpack_require__.O(undefined, ["vendor-chunks/@sqlite.org"], () => (__webpack_require__("(ssr)/./workers/db.worker.ts")))
/******/ 		__webpack_exports__ = __webpack_require__.O(__webpack_exports__);
/******/ 		return __webpack_exports__;
/******/ 	};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/chunk loaded */
/******/ 	(() => {
/******/ 		var deferred = [];
/******/ 		__webpack_require__.O = (result, chunkIds, fn, priority) => {
/******/ 			if(chunkIds) {
/******/ 				priority = priority || 0;
/******/ 				for(var i = deferred.length; i > 0 && deferred[i - 1][2] > priority; i--) deferred[i] = deferred[i - 1];
/******/ 				deferred[i] = [chunkIds, fn, priority];
/******/ 				return;
/******/ 			}
/******/ 			var notFulfilled = Infinity;
/******/ 			for (var i = 0; i < deferred.length; i++) {
/******/ 				var [chunkIds, fn, priority] = deferred[i];
/******/ 				var fulfilled = true;
/******/ 				for (var j = 0; j < chunkIds.length; j++) {
/******/ 					if ((priority & 1 === 0 || notFulfilled >= priority) && Object.keys(__webpack_require__.O).every((key) => (__webpack_require__.O[key](chunkIds[j])))) {
/******/ 						chunkIds.splice(j--, 1);
/******/ 					} else {
/******/ 						fulfilled = false;
/******/ 						if(priority < notFulfilled) notFulfilled = priority;
/******/ 					}
/******/ 				}
/******/ 				if(fulfilled) {
/******/ 					deferred.splice(i--, 1)
/******/ 					var r = fn();
/******/ 					if (r !== undefined) result = r;
/******/ 				}
/******/ 			}
/******/ 			return result;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/ensure chunk */
/******/ 	(() => {
/******/ 		__webpack_require__.f = {};
/******/ 		// This file contains only the entry chunk.
/******/ 		// The chunk loading function for additional chunks
/******/ 		__webpack_require__.e = (chunkId) => {
/******/ 			return Promise.all(Object.keys(__webpack_require__.f).reduce((promises, key) => {
/******/ 				__webpack_require__.f[key](chunkId, promises);
/******/ 				return promises;
/******/ 			}, []));
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/get javascript chunk filename */
/******/ 	(() => {
/******/ 		// This function allow to reference async chunks and sibling chunks for the entrypoint
/******/ 		__webpack_require__.u = (chunkId) => {
/******/ 			// return url for filenames based on template
/******/ 			return "" + chunkId + ".js";
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/relative url */
/******/ 	(() => {
/******/ 		__webpack_require__.U = function RelativeURL(url) {
/******/ 			var realUrl = new URL(url, "x:/");
/******/ 			var values = {};
/******/ 			for (var key in realUrl) values[key] = realUrl[key];
/******/ 			values.href = url;
/******/ 			values.pathname = url.replace(/[?#].*/, "");
/******/ 			values.origin = values.protocol = "";
/******/ 			values.toString = values.toJSON = () => (url);
/******/ 			for (var key in values) Object.defineProperty(this, key, { enumerable: true, configurable: true, value: values[key] });
/******/ 		};
/******/ 		__webpack_require__.U.prototype = URL.prototype;
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/publicPath */
/******/ 	(() => {
/******/ 		__webpack_require__.p = "/_next/";
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/require chunk loading */
/******/ 	(() => {
/******/ 		// no baseURI
/******/ 		
/******/ 		// object to store loaded chunks
/******/ 		// "1" means "loaded", otherwise not loaded yet
/******/ 		var installedChunks = {
/******/ 			"module-_ssr_workers_db_worker_ts": 1
/******/ 		};
/******/ 		
/******/ 		__webpack_require__.O.require = (chunkId) => (installedChunks[chunkId]);
/******/ 		
/******/ 		var installChunk = (chunk) => {
/******/ 			var moreModules = chunk.modules, chunkIds = chunk.ids, runtime = chunk.runtime;
/******/ 			for(var moduleId in moreModules) {
/******/ 				if(__webpack_require__.o(moreModules, moduleId)) {
/******/ 					__webpack_require__.m[moduleId] = moreModules[moduleId];
/******/ 				}
/******/ 			}
/******/ 			if(runtime) runtime(__webpack_require__);
/******/ 			for(var i = 0; i < chunkIds.length; i++)
/******/ 				installedChunks[chunkIds[i]] = 1;
/******/ 			__webpack_require__.O();
/******/ 		};
/******/ 		
/******/ 		// require() chunk loading for javascript
/******/ 		__webpack_require__.f.require = (chunkId, promises) => {
/******/ 			// "1" is the signal for "already loaded"
/******/ 			if(!installedChunks[chunkId]) {
/******/ 				if(true) { // all chunks have JS
/******/ 					installChunk(require("./" + __webpack_require__.u(chunkId)));
/******/ 				} else installedChunks[chunkId] = 1;
/******/ 			}
/******/ 		};
/******/ 		
/******/ 		// no external install chunk
/******/ 		
/******/ 		// no HMR
/******/ 		
/******/ 		// no HMR manifest
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/startup chunk dependencies */
/******/ 	(() => {
/******/ 		var next = __webpack_require__.x;
/******/ 		__webpack_require__.x = () => {
/******/ 			__webpack_require__.e("vendor-chunks/@sqlite.org");
/******/ 			return next();
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// run startup
/******/ 	var __webpack_exports__ = __webpack_require__.x();
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;