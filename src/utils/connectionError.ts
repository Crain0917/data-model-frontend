import type { DataSource } from '../types';

interface TestFailure {
  errorType?: string;
  message?: string;
}

const HOST_PORT = (ds: Pick<DataSource, 'host' | 'port'>) => `${ds.host}:${ds.port}`;

export function testFailureText(
  result: TestFailure,
  ds: Pick<DataSource, 'host' | 'port' | 'dbName'>,
): string {
  const type = (result.errorType || '').toUpperCase();
  const raw = result.message || '';

  if (type === 'REFUSED' || /refused|connectexception|unreachable/i.test(raw)) {
    return `无法连接到 ${HOST_PORT(ds)}，请检查地址、端口与网络连通性`;
  }
  if (type === 'AUTH' || /access denied|authentication|password/i.test(raw)) {
    return '用户名或密码错误，请重新填写';
  }
  if (type === 'DB_NOT_FOUND' || /unknown database|does not exist|不存在|无权限/i.test(raw)) {
    return `默认库 ${ds.dbName || ''} 不存在或无权限访问`;
  }
  if (type === 'TIMEOUT' || /timeout|timed out/i.test(raw)) {
    return '连接超时（>15s），请检查网络或数据库负载';
  }
  if (type === 'DRIVER' || /driver|classnotfound/i.test(raw)) {
    return '未安装达梦 JDBC 驱动或版本不兼容，请联系运维';
  }
  return `连接失败：${raw || '未知错误'}`;
}
