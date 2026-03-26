import { localFileStorage } from './localFileStorage';
import type { Account } from './localFileStorage';

// 默认账户信息
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = '123456';

// 初始化默认账户（不注入任何默认任务参数）
export async function initDefaultAccount(): Promise<Account | null> {
  try {
    let account = await localFileStorage.getAccount(DEFAULT_USERNAME);

    if (!account) {
      console.log('创建默认账户...');
      account = await localFileStorage.registerAccount(DEFAULT_USERNAME, DEFAULT_PASSWORD);
      console.log('默认账户创建成功:', account.username);

      // 新账户初始化为空数据，避免写入任何飞书/金蝶默认参数
      await localFileStorage.saveAccountData(account.id, {
        tasks: [],
        taskInstances: [],
        lastModified: new Date().toISOString(),
      });
      console.log('默认账户数据初始化完成（空任务配置）');
    } else {
      console.log('默认账户已存在:', account.username);
    }

    return account;
  } catch (error: any) {
    console.error('初始化默认账户失败:', error);
    throw new Error(`初始化默认账户失败: ${error.message}`);
  }
}

// 获取默认账户信息
export function getDefaultAccountInfo() {
  return {
    username: DEFAULT_USERNAME,
    password: DEFAULT_PASSWORD,
  };
}
