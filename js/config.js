"use strict";

const STORE_KEY = "jikanri:v1:store";
const BACKUP_KEY = "jikanri:v1:backups";
const REDO_KEY = "jikanri:v1:redo";
const MAX_BACKUPS = 40;

const DEFAULT_SETTINGS = {
  rollingLimit: 28,
  dailyMax: 8,
  pt2DailyMax: 8,
  weeklyPt2Limit: 19,
  monthlyPt2Limit: 70,
  minPt2Hours: 2,
  researchMonthlyWarning: 52,
};
const DEFAULT_CONSTRAINTS = {
  blockWeekends: false,
  useOriginalHolidays: false,
  blockedWeekdays: [],
  dateOverrides: [],
  blockedRanges: [],
  holidays: [],
};

let store;
let lastPlan = [];
let lastSolverMeta = null;
