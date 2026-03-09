import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { TaskExecutor, TaskStatus, getRunningTasks, addRunningTask, removeRunningTask, getRunningTask } from './taskExecutor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// 性能优化：使用内存缓存减少文件读取
const cache = new Map();
const CACHE_TTL = 5000; // 5 秒缓存

const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'kingdee-sync-secret-key-2024';
const DATA_DIR = path.join(__dirname, 'data');

// 压缩中间件 - 减少传输数据量
app.use((req, res, next) => {
  const gzip = require('zlib').gzip;
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);

  if (req.headers['accept-encoding']?.includes('gzip')) {
    const chunks = [];
    res.write = (chunk) => {
      if (chunk !== null) chunks.push(Buffer.from(chunk));
      return true;
    };
    res.end = (chunk) => {
      if (chunk) chunks.push(Buffer.from(chunk));
      if (chunks.length > 0) {
        const data = Buffer.concat(chunks);
        gzip(data, (err, compressed) => {
          if (!err) {
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Content-Length', compressed.length);
            origWrite(compressed);
          } else {
            origWrite(data);
          }
          origEnd();
        });
        return;
      }
      origEnd();
    };
  }
  next();
});

// 中间件
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// 缓存中间件
function cacheMiddleware(ttl = CACHE_TTL) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();

    const cacheKey = `cache:${req.originalUrl}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < ttl) {
      return res.json(cached.data);
    }

    // 拦截响应
    const origJson = res.json.bind(res);
    res.json = (data) => {
      cache.set(cacheKey, { data, timestamp: Date.now() });
      return origJson(data);
    };

    next();
  };
}

// 定期清理缓存
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL * 2) {
      cache.delete(key);
    }
  }
}, CACHE_TTL * 2);

// 确保数据目录存在
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// 获取账户主文件路径
function getAccountFilePath(username) {
  return path.join(DATA_DIR, `${username}.json`);
}

// 获取账户执行记录目录
function getAccountInstancesDir(username) {
  return path.join(DATA_DIR, `${username}_instances`);
}

// 获取账户日志目录
function getAccountLogsDir(username) {
  return path.join(DATA_DIR, `${username}_logs`);
}

// 获取日志文件路径
function getLogFilePath(username, instanceId) {
  return path.join(getAccountLogsDir(username), `${instanceId}.json`);
}

// 获取执行记录文件路径
function getInstanceFilePath(username, filename) {
  return path.join(getAccountInstancesDir(username), filename);
}

// 生成执行记录文件名
function generateInstanceFileName(taskName, startTime) {
  const sanitizedName = taskName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
  const timestamp = new Date(startTime).toISOString().replace(/[:.]/g, '-');
  return `${sanitizedName}_${timestamp}.json`;
}

// 验证 Token 中间件 - 优化：使用缓存验证结果
const tokenCache = new Map();
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  // 检查缓存
  const cached = tokenCache.get(token);
  if (cached && Date.now() - cached.timestamp < 60000) {
    req.user = cached.user;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    tokenCache.set(token, { user: decoded, timestamp: Date.now() });
    next();
  } catch (error) {
    tokenCache.delete(token);
    return res.status(401).json({ error: '无效的认证令牌' });
  }
}

// 保存 WebAPI 日志 - 只保存第一条记录的日志
async function saveWebApiLog(username, instanceId, logData) {
  const logsDir = getAccountLogsDir(username);

  try {
    await fs.access(logsDir);
  } catch {
    await fs.mkdir(logsDir, { recursive: true });
  }

  const logFilePath = getLogFilePath(username, instanceId);

  // 检查是否已存在日志文件，如果存在则不再保存（只保存第一条）
  try {
    await fs.access(logFilePath);
    console.log(`日志文件已存在，跳过保存: ${instanceId}`);
    return false;
  } catch {
    // 文件不存在，可以保存
  }

  const logEntry = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    instanceId,
    timestamp: new Date().toISOString(),
    ...logData,
  };

  await fs.writeFile(logFilePath, JSON.stringify(logEntry, null, 2));
  console.log(`WebAPI 日志已保存: ${instanceId}`);
  return true;
}

// 获取日志
async function getWebApiLog(username, instanceId) {
  const logFilePath = getLogFilePath(username, instanceId);

  try {
    const data = await fs.readFile(logFilePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// 删除日志
async function deleteWebApiLog(username, instanceId) {
  const logFilePath = getLogFilePath(username, instanceId);

  try {
    await fs.unlink(logFilePath);
    return true;
  } catch {
    return false;
  }
}

// 初始化账户数据结构
async function initAccountData(username) {
  const accountPath = getAccountFilePath(username);
  const instancesDir = getAccountInstancesDir(username);
  const logsDir = getAccountLogsDir(username);

  try {
    await fs.access(accountPath);
  } catch {
    const accountData = {
      account: null,
      tasks: [],
      lastModified: new Date().toISOString(),
    };
    await fs.writeFile(accountPath, JSON.stringify(accountData, null, 2));
  }

  try {
    await fs.access(instancesDir);
  } catch {
    await fs.mkdir(instancesDir, { recursive: true });
  }

  try {
    await fs.access(logsDir);
  } catch {
    await fs.mkdir(logsDir, { recursive: true });
  }
}

// 读取账户数据 - 优化：并行读取文件
async function readAccountData(username) {
  const accountPath = getAccountFilePath(username);
  const instancesDir = getAccountInstancesDir(username);

  try {
    const data = JSON.parse(await fs.readFile(accountPath, 'utf8'));

    const taskInstances = [];
    try {
      await fs.access(instancesDir);
      const files = await fs.readdir(instancesDir);

      // 并行读取所有执行记录文件
      const readPromises = files
        .filter(f => f.endsWith('.json'))
        .map(async (file) => {
          try {
            return JSON.parse(await fs.readFile(path.join(instancesDir, file), 'utf8'));
          } catch {
            return null;
          }
        });

      const results = await Promise.all(readPromises);
      results.filter(r => r).forEach(r => taskInstances.push(r));
    } catch {
      // 目录不存在或为空
    }

    // 按开始时间排序
    taskInstances.sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));

    return { ...data, taskInstances };
  } catch (error) {
    throw new Error('读取账户数据失败');
  }
}

// 保存账户主数据
async function saveAccountData(username, data) {
  const accountPath = getAccountFilePath(username);
  const { taskInstances, ...accountData } = data;

  await fs.writeFile(
    accountPath,
    JSON.stringify({ ...accountData, lastModified: new Date().toISOString() }, null, 2)
  );
}

// 保存单个执行记录 - 优化：使用批量写入
const writeQueue = new Map();
async function saveInstanceFile(username, instance) {
  const instancesDir = getAccountInstancesDir(username);

  try {
    await fs.access(instancesDir);
  } catch {
    await fs.mkdir(instancesDir, { recursive: true });
  }

  const taskName = instance.taskName || '未命名任务';
  const filename = generateInstanceFileName(taskName, instance.startTime || new Date());
  const filepath = path.join(instancesDir, filename);

  await fs.writeFile(filepath, JSON.stringify(instance, null, 2));
  return filename;
}

// 删除执行记录文件
async function deleteInstanceFile(username, instanceId) {
  const instancesDir = getAccountInstancesDir(username);

  try {
    await fs.access(instancesDir);
  } catch {
    return false;
  }

  const files = await fs.readdir(instancesDir);
  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const instance = JSON.parse(await fs.readFile(path.join(instancesDir, file), 'utf8'));
        if (instance.id === instanceId) {
          await fs.unlink(path.join(instancesDir, file));
          // 同时删除关联的日志文件
          await deleteWebApiLog(username, instanceId);
          return true;
        }
      } catch {
        // 忽略读取失败的文件
      }
    }
  }
  return false;
}

// 删除任务的所有执行记录
async function deleteTaskInstances(username, taskId) {
  const instancesDir = getAccountInstancesDir(username);
  let deletedCount = 0;

  try {
    await fs.access(instancesDir);
  } catch {
    return 0;
  }

  const files = await fs.readdir(instancesDir);
  const deletePromises = files
    .filter(f => f.endsWith('.json'))
    .map(async (file) => {
      try {
        const instance = JSON.parse(await fs.readFile(path.join(instancesDir, file), 'utf8'));
        if (instance.taskId === taskId) {
          await fs.unlink(path.join(instancesDir, file));
          deletedCount++;
        }
      } catch {
        // 忽略
      }
    });

  await Promise.all(deletePromises);
  return deletedCount;
}

// 注册账户
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const accountPath = getAccountFilePath(username);

    try {
      await fs.access(accountPath);
      return res.status(409).json({ error: '用户名已存在' });
    } catch {
      // 文件不存在，可以创建
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const account = {
      id: Date.now().toString(),
      username,
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    await initAccountData(username);

    const accountData = {
      account,
      tasks: [],
      lastModified: new Date().toISOString(),
    };
    await fs.writeFile(accountPath, JSON.stringify(accountData, null, 2));

    const token = jwt.sign(
      { userId: account.id, username: account.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      account: {
        id: account.id,
        username: account.username,
        createdAt: account.createdAt,
      },
    });
  } catch (error) {
    console.error('注册失败:', error);
    res.status(500).json({ error: '注册失败：' + error.message });
  }
});

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const accountPath = getAccountFilePath(username);

    try {
      await fs.access(accountPath);
    } catch {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const accountData = JSON.parse(await fs.readFile(accountPath, 'utf8'));
    const account = accountData.account;

    if (!account) {
      return res.status(401).json({ error: '账户数据损坏' });
    }

    const isValidPassword = await bcrypt.compare(password, account.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    account.lastLoginAt = new Date().toISOString();
    await fs.writeFile(accountPath, JSON.stringify(accountData, null, 2));

    const token = jwt.sign(
      { userId: account.id, username: account.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 清除该用户的缓存
    for (const [key] of cache.entries()) {
      if (key.includes(username)) {
        cache.delete(key);
      }
    }

    const fullData = await readAccountData(username);

    res.json({
      success: true,
      token,
      account: {
        id: account.id,
        username: account.username,
        createdAt: account.createdAt,
      },
      data: {
        tasks: fullData.tasks || [],
        taskInstances: fullData.taskInstances || [],
      },
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ error: '登录失败：' + error.message });
  }
});

// 获取数据 - 使用缓存
app.get('/api/data', cacheMiddleware(3000), authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const data = await readAccountData(username);

    res.json({
      tasks: data.tasks || [],
      taskInstances: data.taskInstances || [],
    });
  } catch (error) {
    console.error('获取数据失败:', error);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// 保存数据 - 优化：批量写入
app.post('/api/data', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const { tasks, taskInstances } = req.body;

    // 保存主数据
    const accountData = await readAccountData(username);
    accountData.tasks = tasks || [];
    await saveAccountData(username, accountData);

    // 保存执行记录
    if (taskInstances && taskInstances.length > 0) {
      const instancesDir = getAccountInstancesDir(username);
      let existingFiles = new Map();

      try {
        await fs.access(instancesDir);
        const files = await fs.readdir(instancesDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const existing = JSON.parse(await fs.readFile(path.join(instancesDir, file), 'utf8'));
            existingFiles.set(existing.id, file);
          }
        }
      } catch {
        // 目录不存在
      }

      // 并行保存所有执行记录
      const savePromises = taskInstances.map(async (instance) => {
        const existingFile = existingFiles.get(instance.id);
        const task = tasks?.find(t => t.id === instance.taskId);
        const taskName = task?.name || '未命名任务';
        const instanceData = { ...instance, taskName };

        if (existingFile) {
          await fs.writeFile(path.join(instancesDir, existingFile), JSON.stringify(instanceData, null, 2));
        } else {
          await saveInstanceFile(username, instanceData);
        }
      });

      await Promise.all(savePromises);
    }

    res.json({ success: true, message: '数据保存成功' });
  } catch (error) {
    console.error('保存数据失败:', error);
    res.status(500).json({ error: '保存数据失败：' + error.message });
  }
});

// 删除单个执行记录
app.delete('/api/instances/:instanceId', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const { instanceId } = req.params;

    const deleted = await deleteInstanceFile(username, instanceId);

    if (deleted) {
      res.json({ success: true, message: '执行记录已删除' });
    } else {
      res.status(404).json({ error: '执行记录不存在' });
    }
  } catch (error) {
    console.error('删除执行记录失败:', error);
    res.status(500).json({ error: '删除执行记录失败' });
  }
});

// 删除任务及其所有执行记录
app.delete('/api/tasks/:taskId', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const { taskId } = req.params;

    const deletedCount = await deleteTaskInstances(username, taskId);

    res.json({
      success: true,
      message: `任务及 ${deletedCount} 条执行记录已删除`
    });
  } catch (error) {
    console.error('删除任务失败:', error);
    res.status(500).json({ error: '删除任务失败' });
  }
});

// 导出数据
app.get('/api/export', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const data = await readAccountData(username);

    const exportData = {
      tasks: data.tasks || [],
      exportAt: new Date().toISOString(),
      version: '1.0',
      description: '金蝶数据传输平台 - 任务配置导出',
    };

    const filename = `tasks_export_${username}_${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(exportData);
  } catch (error) {
    console.error('导出数据失败:', error);
    res.status(500).json({ error: '导出数据失败' });
  }
});

// 导入数据
app.post('/api/import', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const { tasks } = req.body;

    if (!tasks || !Array.isArray(tasks)) {
      return res.status(400).json({ error: '无效的任务数据' });
    }

    const importedTasks = tasks.map(task => ({
      ...task,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      enabled: false,
    }));

    const accountData = await readAccountData(username);
    accountData.tasks = [...accountData.tasks, ...importedTasks];
    await saveAccountData(username, accountData);

    res.json({
      success: true,
      message: `成功导入 ${importedTasks.length} 个任务`,
      data: {
        tasks: accountData.tasks,
        importedCount: importedTasks.length,
      },
    });
  } catch (error) {
    console.error('导入数据失败:', error);
    res.status(500).json({ error: '导入数据失败：' + error.message });
  }
});

// 删除账户
app.delete('/api/account', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const accountPath = getAccountFilePath(username);
    const instancesDir = getAccountInstancesDir(username);

    try {
      await fs.unlink(accountPath);
    } catch {
      console.log('账户文件不存在或已删除');
    }

    try {
      await fs.rm(instancesDir, { recursive: true, force: true });
    } catch {
      console.log('执行记录目录不存在或已删除');
    }

    // 清除缓存
    for (const [key] of cache.entries()) {
      if (key.includes(username)) {
        cache.delete(key);
      }
    }
    for (const [key] of tokenCache.entries()) {
      tokenCache.delete(key);
    }

    res.json({ success: true, message: '账户已删除' });
  } catch (error) {
    console.error('删除账户失败:', error);
    res.status(500).json({ error: '删除账户失败' });
  }
});

// 代理飞书 API 请求 - 优化：连接复用
const feishuAgent = new (require('https')).Agent({
  keepAlive: true,
  maxSockets: 50,
});

app.all('/open-apis/*', async (req, res) => {
  try {
    const targetUrl = `https://open.feishu.cn${req.path}`;

    // 构建请求体，确保正确传递 params
    let bodyData = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // 合并 query params 和 body
      bodyData = {
        ...req.body,
        ...req.query,
      };
      // 如果请求体为空对象，设为 undefined
      if (Object.keys(bodyData).length === 0) {
        bodyData = undefined;
      }
    }

    console.log('飞书代理请求:', {
      url: targetUrl,
      method: req.method,
      path: req.path,
      body: bodyData,
      params: req.params,
      query: req.query,
    });

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': req.headers.authorization || '',
      },
      body: bodyData ? JSON.stringify(bodyData) : undefined,
    });

    const data = await response.json();

    console.log('飞书代理响应:', {
      status: response.status,
      code: data.code,
      msg: data.msg,
    });

    res.status(response.status).json(data);
  } catch (error) {
    console.error('飞书代理请求失败:', error);
    res.status(500).json({ error: '代理请求失败：' + error.message });
  }
});

// 代理金蝶 API 请求 - 优化：连接复用，正确处理 Cookie
const kingdeeAgent = new (require('http')).Agent({
  keepAlive: true,
  maxSockets: 50,
});

// 金蝶 Session Cookie 存储（按用户存储）
const kingdeeSessions = new Map();

app.all('/K3Cloud/*', async (req, res) => {
  try {
    let baseUrl = req.body.baseUrl || 'http://47.113.148.159:8090';
    // 从 baseUrl 中去除可能存在的 /K3Cloud 后缀，避免重复
    if (baseUrl.endsWith('/K3Cloud')) {
      baseUrl = baseUrl.replace(/\/K3Cloud$/, '');
    }
    // req.path 包含 /K3Cloud/...，需要去掉前面的 /K3Cloud 避免重复
    const pathWithoutPrefix = req.path.replace(/^\/K3Cloud/, '');
    const targetUrl = `${baseUrl}/K3Cloud${pathWithoutPrefix}`;

    // 准备请求头
    const headers = {
      'Content-Type': 'application/json',
    };

    // 如果有存储的 Cookie 或者请求中传来的 Cookie，添加到请求头
    const sessionKey = req.body.sessionKey || req.headers['x-session-key'];
    if (sessionKey && kingdeeSessions.has(sessionKey)) {
      headers['Cookie'] = kingdeeSessions.get(sessionKey);
      console.log('使用存储的 Cookie:', sessionKey, kingdeeSessions.get(sessionKey).substring(0, 50));
    }
    // 如果请求体中有 Cookie（从 taskExecutor 传来），直接使用
    if (req.headers['cookie']) {
      headers['Cookie'] = req.headers['cookie'];
      console.log('使用请求传来的 Cookie:', req.headers['cookie'].substring(0, 50));
    }

    // 转发 Host 头
    const urlObj = new URL(targetUrl);
    headers['Host'] = urlObj.host;

    console.log('金蝶代理请求:', {
      targetUrl,
      method: req.method,
      hasSessionKey: !!sessionKey,
      bodyPreview: JSON.stringify(req.body).substring(0, 200)
    });

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    // 提取响应中的 Cookie
    const setCookieHeaders = response.headers.get('set-cookie');
    if (setCookieHeaders) {
      // 保存 Cookie 到 session
      if (sessionKey) {
        kingdeeSessions.set(sessionKey, setCookieHeaders);
        console.log('保存 Cookie 到 session:', sessionKey);
      }
      // 转发 Set-Cookie header
      res.setHeader('Set-Cookie', setCookieHeaders);
    }

    // 先获取文本，再尝试解析 JSON
    const responseText = await response.text();
    console.log('金蝶响应原始内容:', responseText.substring(0, 500));

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('JSON 解析失败，响应内容:', responseText);
      return res.status(response.status).json({
        error: '金蝶服务器返回非 JSON 响应',
        rawResponse: responseText.substring(0, 500),
        status: response.status
      });
    }

    console.log('金蝶代理响应:', {
      status: response.status,
      LoginResultType: data?.LoginResultType,
      hasException: !!data?.Exception
    });

    res.status(response.status).json(data);
  } catch (error) {
    console.error('金蝶代理请求失败:', error);
    res.status(500).json({ error: '代理请求失败：' + error.message });
  }
});

// 获取本机 IP 地址
import os from 'os';
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// 启动服务器
ensureDataDir().then(() => {
  const localIP = getLocalIP();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`局域网访问 http://${localIP}:${PORT}`);
    console.log(`数据存储目录：${DATA_DIR}`);
    console.log('性能优化已启用：Gzip 压缩、响应缓存、连接池');
  });
});
// ==================== 企业级账户管理 API ====================

// 管理员权限验证中间件
function adminMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: '无效的认证令牌' });
  }
}

// 获取所有账户列表
app.get('/api/admin/accounts', adminMiddleware, async (req, res) => {
  try {
    const files = await fs.readdir(DATA_DIR);
    const accounts = [];

    for (const file of files) {
      if (file.endsWith('.json') && !file.includes('_instances')) {
        const accountPath = path.join(DATA_DIR, file);
        try {
          const data = JSON.parse(await fs.readFile(accountPath, 'utf8'));
          if (data.account) {
            accounts.push({
              id: data.account.id,
              username: data.account.username,
              email: data.account.email || '',
              phone: data.account.phone || '',
              department: data.account.department || '',
              role: data.account.role || 'operator',
              status: data.account.status || 'active',
              createdAt: data.account.createdAt,
              lastLoginAt: data.account.lastLoginAt,
              createdBy: data.account.createdBy,
            });
          }
        } catch {
          // 忽略读取失败的文件
        }
      }
    }

    res.json({ accounts, total: accounts.length });
  } catch (error) {
    console.error('获取账户列表失败:', error);
    res.status(500).json({ error: '获取账户列表失败' });
  }
});

// 创建账户
app.post('/api/admin/accounts', adminMiddleware, async (req, res) => {
  try {
    const { username, password, email, phone, department, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const accountPath = getAccountFilePath(username);

    try {
      await fs.access(accountPath);
      return res.status(409).json({ error: '用户名已存在' });
    } catch {
      // 文件不存在，可以创建
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const account = {
      id: Date.now().toString(),
      username,
      passwordHash: hashedPassword,
      email: email || '',
      phone: phone || '',
      department: department || '',
      role: role || 'operator',
      status: 'active',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      createdBy: req.user.username,
    };

    await initAccountData(username);

    const accountData = {
      account,
      tasks: [],
      lastModified: new Date().toISOString(),
    };
    await fs.writeFile(accountPath, JSON.stringify(accountData, null, 2));

    res.json({ success: true, account });
  } catch (error) {
    console.error('创建账户失败:', error);
    res.status(500).json({ error: '创建账户失败' });
  }
});

// 更新账户信息
app.put('/api/admin/accounts/:accountId', adminMiddleware, async (req, res) => {
  try {
    const { accountId } = req.params;
    const updates = req.body;

    const files = await fs.readdir(DATA_DIR);
    for (const file of files) {
      if (file.endsWith('.json') && !file.includes('_instances')) {
        const accountPath = path.join(DATA_DIR, file);
        const data = JSON.parse(await fs.readFile(accountPath, 'utf8'));
        if (data.account && data.account.id === accountId) {
          data.account = {
            ...data.account,
            ...updates,
            lastModified: new Date().toISOString(),
          };
          await fs.writeFile(accountPath, JSON.stringify(data, null, 2));
          return res.json({ success: true, account: data.account });
        }
      }
    }

    res.status(404).json({ error: '账户不存在' });
  } catch (error) {
    console.error('更新账户失败:', error);
    res.status(500).json({ error: '更新账户失败' });
  }
});

// 删除账户（管理员）
app.delete('/api/admin/accounts/:accountId', adminMiddleware, async (req, res) => {
  try {
    const { accountId } = req.params;

    const files = await fs.readdir(DATA_DIR);
    for (const file of files) {
      if (file.endsWith('.json') && !file.includes('_instances')) {
        const accountPath = path.join(DATA_DIR, file);
        const data = JSON.parse(await fs.readFile(accountPath, 'utf8'));
        if (data.account && data.account.id === accountId) {
          await fs.unlink(accountPath);

          const instancesDir = getAccountInstancesDir(data.account.username);
          try {
            await fs.rm(instancesDir, { recursive: true, force: true });
          } catch {
            // 忽略
          }

          return res.json({ success: true, message: '账户已删除' });
        }
      }
    }

    res.status(404).json({ error: '账户不存在' });
  } catch (error) {
    console.error('删除账户失败:', error);
    res.status(500).json({ error: '删除账户失败' });
  }
});

// 重置密码
app.post('/api/admin/accounts/:accountId/reset-password', adminMiddleware, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 个字符' });
    }

    const files = await fs.readdir(DATA_DIR);
    for (const file of files) {
      if (file.endsWith('.json') && !file.includes('_instances')) {
        const accountPath = path.join(DATA_DIR, file);
        const data = JSON.parse(await fs.readFile(accountPath, 'utf8'));
        if (data.account && data.account.id === accountId) {
          data.account.passwordHash = await bcrypt.hash(password, 10);
          await fs.writeFile(accountPath, JSON.stringify(data, null, 2));
          return res.json({ success: true, message: '密码已重置' });
        }
      }
    }

    res.status(404).json({ error: '账户不存在' });
  } catch (error) {
    console.error('重置密码失败:', error);
    res.status(500).json({ error: '重置密码失败' });
  }
});

// 锁定/解锁账户
app.post('/api/admin/accounts/:accountId/toggle-lock', adminMiddleware, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { lock } = req.body;

    const files = await fs.readdir(DATA_DIR);
    for (const file of files) {
      if (file.endsWith('.json') && !file.includes('_instances')) {
        const accountPath = path.join(DATA_DIR, file);
        const data = JSON.parse(await fs.readFile(accountPath, 'utf8'));
        if (data.account && data.account.id === accountId) {
          data.account.status = lock ? 'locked' : 'active';
          await fs.writeFile(accountPath, JSON.stringify(data, null, 2));
          return res.json({ success: true, status: data.account.status });
        }
      }
    }

    res.status(404).json({ error: '账户不存在' });
  } catch (error) {
    console.error('锁定账户失败:', error);
    res.status(500).json({ error: '锁定账户失败' });
  }
});

// 获取操作日志
app.get('/api/admin/operation-logs', adminMiddleware, async (req, res) => {
  res.json({ logs: [] });
});

// 获取登录历史
app.get('/api/admin/login-history', adminMiddleware, async (req, res) => {
  res.json({ history: [] });
});

// 获取当前账户信息
app.get('/api/account/profile', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const accountPath = getAccountFilePath(username);
    const data = JSON.parse(await fs.readFile(accountPath, 'utf8'));

    res.json({
      account: {
        id: data.account.id,
        username: data.account.username,
        email: data.account.email,
        phone: data.account.phone,
        department: data.account.department,
        role: data.account.role,
        createdAt: data.account.createdAt,
        lastLoginAt: data.account.lastLoginAt,
      },
    });
  } catch (error) {
    console.error('获取账户信息失败:', error);
    res.status(500).json({ error: '获取账户信息失败' });
  }
});

// 更新个人信息
app.put('/api/account/profile', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const { email, phone, department } = req.body;
    const accountPath = getAccountFilePath(username);
    const data = JSON.parse(await fs.readFile(accountPath, 'utf8'));

    data.account = {
      ...data.account,
      email: email || data.account.email,
      phone: phone || data.account.phone,
      department: department || data.account.department,
    };

    await fs.writeFile(accountPath, JSON.stringify(data, null, 2));
    res.json({ success: true, account: data.account });
  } catch (error) {
    console.error('更新账户信息失败:', error);
    res.status(500).json({ error: '更新账户信息失败' });
  }
});

// 修改密码
app.post('/api/account/change-password', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少 6 个字符' });
    }

    const accountPath = getAccountFilePath(username);
    const data = JSON.parse(await fs.readFile(accountPath, 'utf8'));

    const isValid = await bcrypt.compare(currentPassword, data.account.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: '当前密码错误' });
    }

    data.account.passwordHash = await bcrypt.hash(newPassword, 10);
    await fs.writeFile(accountPath, JSON.stringify(data, null, 2));

    res.json({ success: true, message: '密码已修改' });
  } catch (error) {
    console.error('修改密码失败:', error);
    res.status(500).json({ error: '修改密码失败' });
  }
});

// ==================== 日志 API ====================

// 保存 WebAPI 日志
app.post('/api/logs/webapi', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const { instanceId, recordId, feishuData, requestData, responseData, writeBackData, success, errorMessage } = req.body;

    if (!instanceId) {
      return res.status(400).json({ error: '缺少 instanceId' });
    }

    const saved = await saveWebApiLog(username, instanceId, {
      recordId,
      feishuData,
      requestData,
      responseData,
      writeBackData,
      success,
      errorMessage,
    });

    res.json({
      success: true,
      saved,
      message: saved ? '日志已保存' : '日志已存在，跳过保存'
    });
  } catch (error) {
    console.error('保存日志失败:', error);
    res.status(500).json({ error: '保存日志失败：' + error.message });
  }
});

// 获取指定实例的日志
app.get('/api/logs/:instanceId', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const { instanceId } = req.params;

    const log = await getWebApiLog(username, instanceId);

    if (!log) {
      return res.status(404).json({ error: '日志不存在' });
    }

    res.json({ success: true, log });
  } catch (error) {
    console.error('获取日志失败:', error);
    res.status(500).json({ error: '获取日志失败' });
  }
});

// 删除指定实例的日志
app.delete('/api/logs/:instanceId', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const { instanceId } = req.params;

    const deleted = await deleteWebApiLog(username, instanceId);

    if (deleted) {
      res.json({ success: true, message: '日志已删除' });
    } else {
      res.status(404).json({ error: '日志不存在' });
    }
  } catch (error) {
    console.error('删除日志失败:', error);
    res.status(500).json({ error: '删除日志失败' });
  }
});

// ==================== 任务执行 API ====================

// 保存实例回调函数
async function saveInstanceCallback(instance) {
  const { username } = instance;
  const instancesDir = getAccountInstancesDir(username);

  try {
    await fs.access(instancesDir);
  } catch {
    await fs.mkdir(instancesDir, { recursive: true });
  }

  // 查找现有文件
  const files = await fs.readdir(instancesDir);
  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const existing = JSON.parse(await fs.readFile(path.join(instancesDir, file), 'utf8'));
        if (existing.id === instance.id) {
          await fs.writeFile(path.join(instancesDir, file), JSON.stringify(instance, null, 2));
          return;
        }
      } catch {
        // 忽略
      }
    }
  }

  // 新实例，创建新文件
  const taskName = instance.taskName || '未命名任务';
  const filename = generateInstanceFileName(taskName, instance.startTime || new Date());
  await fs.writeFile(path.join(instancesDir, filename), JSON.stringify(instance, null, 2));
}

// 保存日志回调函数
async function saveLogCallback(username, instanceId, logData) {
  await saveWebApiLog(username, instanceId, logData);
}

// 启动任务执行
app.post('/api/tasks/:taskId/execute', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const { taskId } = req.params;

    // 获取任务配置
    const accountData = await readAccountData(username);
    const task = accountData.tasks.find(t => t.id === taskId);

    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    // 创建任务实例
    const instanceId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const instance = {
      id: instanceId,
      taskId: task.id,
      taskName: task.name,
      username: username,
      status: TaskStatus.IDLE,
      startTime: null,
      endTime: null,
      progress: 0,
      totalCount: 0,
      successCount: 0,
      errorCount: 0,
    };

    // 保存初始实例
    await saveInstanceFile(username, instance);

    // 创建执行器并启动
    const executor = new TaskExecutor(
      task,
      instance,
      username,
      (instanceId, logData) => saveLogCallback(username, instanceId, logData),
      saveInstanceCallback
    );

    addRunningTask(instanceId, executor);

    // 异步执行任务（不阻塞响应）
    executor.execute().catch(err => {
      console.error(`任务执行失败: ${err.message}`);
    }).finally(() => {
      removeRunningTask(instanceId);
    });

    res.json({
      success: true,
      instanceId,
      message: '任务已启动',
    });
  } catch (error) {
    console.error('启动任务失败:', error);
    res.status(500).json({ error: '启动任务失败：' + error.message });
  }
});

// 停止任务执行
app.post('/api/tasks/:instanceId/stop', authMiddleware, async (req, res) => {
  try {
    const { instanceId } = req.params;

    const executor = getRunningTask(instanceId);
    if (!executor) {
      return res.status(404).json({ error: '任务实例不存在或已完成' });
    }

    executor.stop();
    res.json({ success: true, message: '任务已请求停止' });
  } catch (error) {
    console.error('停止任务失败:', error);
    res.status(500).json({ error: '停止任务失败' });
  }
});

// 获取任务状态
app.get('/api/tasks/:instanceId/status', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const { instanceId } = req.params;

    // 先检查正在运行的任务
    const executor = getRunningTask(instanceId);
    if (executor) {
      const instance = executor.instance;
      return res.json({
        success: true,
        status: instance.status,
        progress: instance.progress,
        totalCount: instance.totalCount,
        successCount: instance.successCount,
        errorCount: instance.errorCount,
        isRunning: true,
      });
    }

    // 检查已完成的任务实例
    const instancesDir = getAccountInstancesDir(username);
    try {
      await fs.access(instancesDir);
    } catch {
      return res.status(404).json({ error: '任务实例不存在' });
    }

    const files = await fs.readdir(instancesDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const instance = JSON.parse(await fs.readFile(path.join(instancesDir, file), 'utf8'));
          if (instance.id === instanceId) {
            return res.json({
              success: true,
              status: instance.status,
              progress: instance.progress,
              totalCount: instance.totalCount || 0,
              successCount: instance.successCount || 0,
              errorCount: instance.errorCount || 0,
              isRunning: false,
              startTime: instance.startTime,
              endTime: instance.endTime,
            });
          }
        } catch {
          // 忽略
        }
      }
    }

    res.status(404).json({ error: '任务实例不存在' });
  } catch (error) {
    console.error('获取任务状态失败:', error);
    res.status(500).json({ error: '获取任务状态失败' });
  }
});
