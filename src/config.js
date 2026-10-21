import path from 'node:path';
import os from 'node:os';

const env = process.env;

export const PORT = Number(env.PORT || env.SERVER_PORT || 8080);
export const DATA_DIR = path.resolve(env.DATA_DIR || './data');
export const SINGBOX_BIN = path.resolve(
  env.SINGBOX_BIN || (os.platform() === 'win32' ? './bin/sing-box.exe' : './bin/sing-box')
);

export const REFRESH_MINUTES = Math.max(5, Number(env.REFRESH_MINUTES || 30));
export const MAX_TEST_PER_CYCLE = Math.max(20, Number(env.MAX_TEST_PER_CYCLE || 300));
export const TEST_CONCURRENCY = Math.max(4, Number(env.TEST_CONCURRENCY || 16));
export const TEST_TIMEOUT_MS = Math.max(2000, Number(env.TEST_TIMEOUT_MS || 8000));
export const SPEED_TEST = (env.SPEED_TEST || '1') !== '0';
export const SPEED_LIMIT = Math.max(0, Number(env.SPEED_LIMIT || 40));
export const MAX_OUTPUT = Math.max(1, Number(env.MAX_OUTPUT || 300));
export const MIN_SPEED_KBPS = Number(env.MIN_SPEED_KBPS || 800);
export const MAX_LATENCY_MS = Number(env.MAX_LATENCY_MS || 1500);
export const MIN_STREAK = Number(env.MIN_STREAK || 2);
export const MIN_SPEED_HOME = Number(env.MIN_SPEED_HOME || 300);
export const MAX_LATENCY_HOME = Number(env.MAX_LATENCY_HOME || 2500);
export const MIN_STREAK_HOME = Number(env.MIN_STREAK_HOME || 1);
export const RESIDENTIAL_ONLY = (env.RESIDENTIAL_ONLY || '1') !== '0';
export const SUB_TOKEN = (env.SUB_TOKEN || '').trim();
export const SUB_TITLE = (env.SUB_TITLE || 'FreeProxy Sub').trim();

export const DEFAULT_SOURCES = [
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt',
  'https://raw.githubusercontent.com/Epodonios/v2ray-configs/main/All_Configs_Sub.txt',
  'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub',
  'https://raw.githubusercontent.com/freefq/free/master/v2',
  'https://raw.githubusercontent.com/ripaojiedian/freenode/main/sub',
  'https://raw.githubusercontent.com/ermaozi/get_subscribe/main/subscribe/v2ray.txt',
  'https://raw.githubusercontent.com/peasoft/NoMoreWalls/master/list.txt',
];

export const SOURCES = (env.SOURCES ? env.SOURCES.split(/[\s,]+/).filter(Boolean) : DEFAULT_SOURCES);



