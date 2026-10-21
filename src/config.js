import path from 'node:path';
import os from 'node:os';

const env = process.env;

export const PORT = Number(env.PORT || env.SERVER_PORT || 8080);
export const DATA_DIR = path.resolve(env.DATA_DIR || './data');
export const SINGBOX_BIN = path.resolve(
  env.SINGBOX_BIN || (os.platform() === 'win32' ? './bin/sing-box.exe' : './bin/sing-box')
);

export const REFRESH_MINUTES = Math.max(5, Number(env.REFRESH_MINUTES || 30));
export const MAX_TEST_PER_CYCLE = Math.max(20, Number(env.MAX_TEST_PER_CYCLE || 200));
export const TEST_CONCURRENCY = Math.max(4, Number(env.TEST_CONCURRENCY || 16));
export const TEST_TIMEOUT_MS = Math.max(2000, Number(env.TEST_TIMEOUT_MS || 8000));
export const SPEED_TEST = (env.SPEED_TEST || '1') !== '0';
export const SPEED_LIMIT = Math.max(0, Number(env.SPEED_LIMIT || 30));
export const MAX_OUTPUT = Math.max(1, Number(env.MAX_OUTPUT || 300));
export const SUB_TOKEN = (env.SUB_TOKEN || '').trim();
export const SUB_TITLE = (env.SUB_TITLE || 'FreeProxy Sub').trim();

export const DEFAULT_SOURCES = [
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt',
  'https://raw.githubusercontent.com/Epodonios/v2ray-configs/main/All_Configs_Sub.txt',
  'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub',
  'https://raw.githubusercontent.com/freefq/free/master/v2',
];

export const SOURCES = (env.SOURCES ? env.SOURCES.split(/[\s,]+/).filter(Boolean) : DEFAULT_SOURCES);


