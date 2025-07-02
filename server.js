const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
// **** NEW: Import Firebase Admin SDK ****
const admin = require('firebase-admin');

// --- **** NEW: Initialize Firebase **** ---
// Get the service account key from environment variables
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Get a reference to the Firestore database
const db = admin.firestore();
console.log('Successfully connected to Firebase Firestore.');


const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- API Keys from Environment Variables ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;


// --- **** REWRITTEN: User Endpoints with Firestore **** ---

// Register a new user
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: '用户名和密码不能为空' });
    }
    try {
        const userRef = db.collection('users').doc(username);
        const doc = await userRef.get();

        if (doc.exists) {
            return res.status(400).json({ message: '用户名已存在' });
        }

        const newUser = {
            username,
            password, // In a real app, you MUST hash the password!
            credits: 50, // Welcome credits
        };
        await userRef.set(newUser);
        
        console.log('新用户注册成功:', username);
        res.status(201).json({ message: '注册成功！', user: { username, credits: 50 } });
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ message: "注册失败，服务器错误" });
    }
});

// Login a user
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const userRef = db.collection('users').doc(username);
        const doc = await userRef.get();

        if (!doc.exists || doc.data().password !== password) {
            return res.status(401).json({ message: '用户名或密码错误' });
        }
        
        const userData = doc.data();
        console.log('用户登录成功:', username);
        res.json({ message: '登录成功！', user: { username: userData.username, credits: userData.credits } });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "登录失败，服务器错误" });
    }
});

// Get user status
app.get('/api/user/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const userRef = db.collection('users').doc(username);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(404).json({ message: '用户不存在' });
        }
        const userData = doc.data();
        res.json({ user: { username: userData.username, credits: userData.credits } });
    } catch (error) {
        console.error("Get user status error:", error);
        res.status(500).json({ message: "获取用户信息失败" });
    }
});

// Simulate payment to add credits
app.post('/api/create-payment', async (req, res) => {
    const { username } = req.body;
    try {
        const userRef = db.collection('users').doc(username);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(404).json({ message: '用户不存在，无法充值' });
        }
        
        // Use Firestore's FieldValue to atomically increment credits
        await userRef.update({
            credits: admin.firestore.FieldValue.increment(50)
        });
        
        const updatedDoc = await userRef.get();
        const updatedUserData = updatedDoc.data();
        
        console.log(`模拟支付成功！用户 ${username} 的余额已更新为 ${updatedUserData.credits} 次。`);
        res.json({
            message: '充值成功！',
            user: { username: updatedUserData.username, credits: updatedUserData.credits }
        });
    } catch (error) {
        console.error("Payment error:", error);
        res.status(500).json({ message: "充值失败，服务器错误" });
    }
});


// --- Protected Core Endpoints ---

app.post('/api/generate-comment', async (req, res) => {
    try {
        const { studentProfiles, commentStyle, model, username } = req.body;
        const userRef = db.collection('users').doc(username);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(401).json({ message: '用户未登录，请先登录' });
        }

        const user = doc.data();
        const requiredCredits = studentProfiles.length;

        if (user.credits < requiredCredits) {
            return res.status(403).json({ message: `次数不足！本次需要 ${requiredCredits} 次，您还剩 ${user.credits} 次。` });
        }

        const prompt = getBasePrompt(studentProfiles, commentStyle);
        const aiResponse = await callAI(model, prompt, false);
        
        await userRef.update({
            credits: admin.firestore.FieldValue.increment(-requiredCredits)
        });

        console.log(`用户 ${username} 消耗 ${requiredCredits} 次，剩余 ${user.credits - requiredCredits} 次`);
        res.json(aiResponse);
    } catch (error) {
        console.error('处理【评语生成】请求时出错:', error);
        res.status(500).json({ message: '服务器处理请求失败', error: error.message });
    }
});

app.post('/api/generate-alternatives', async (req, res) => {
    try {
        const { originalText, sourceTag, commentStyle, model, username } = req.body;
        const userRef = db.collection('users').doc(username);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(401).json({ message: '用户未登录，请先登录' });
        }
        
        const prompt = `你是一个语言表达大师。请将下面的句子，用5种不同的、高质量的方式重新表达，同时保持核心意思和“${commentStyle}”的风格。句子：“${originalText}”。它描述的概念是“${sourceTag}”。请以JSON数组的格式返回5个字符串。`;
        const aiResponse = await callAI(model, prompt, true);
        
        res.json(aiResponse);
    } catch (error) {
        console.error('处理【同义句生成】请求时出错:', error);
        res.status(500).json({ message: '服务器处理同义句请求失败', error: error.message });
    }
});


// --- Server Start ---
app.listen(PORT, () => {
  console.log(`后台办公室已经启动，正在 http://localhost:${PORT} 等待指令`);
});


// --- Helper Functions ---
async function callAI(model, prompt, isSimpleArray) {
    let apiKey, url, payload;
    const commonHeaders = { 'Content-Type': 'application/json' };

    if (model === 'gemini') {
        apiKey = GEMINI_API_KEY;
        url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
        const schema = isSimpleArray 
            ? { type: 'ARRAY', items: { type: 'STRING' } } 
            : { type: 'ARRAY', items: { type: 'OBJECT', properties: { studentName: { type: 'STRING' }, intro: { type: 'STRING' }, body: { type: 'ARRAY', items: { type: 'OBJECT', properties: { source: { type: 'STRING' }, text: { type: 'STRING' } } } }, conclusion: { type: 'STRING' } }, required: ['studentName', 'intro', 'body', 'conclusion'] } };
        payload = { 
            contents: [{ role: "user", parts: [{ text: prompt }] }], 
            generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.8 } 
        };
    } else if (model === 'deepseek' || model === 'openai') {
        const baseHost = model === 'openai' ? 'https://api.openai.com' : 'https://api.deepseek.com';
        apiKey = model === 'openai' ? 'OPENAI_API_KEY_PLACEHOLDER' : DEEPSEEK_API_KEY;
        const modelName = model === 'openai' ? 'gpt-4o-mini' : 'deepseek-chat';
        url = `${baseHost}/chat/completions`;
        payload = {
            model: modelName,
            messages: [{ role: 'system', content: "You are a helpful assistant designed to output JSON." }, { role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.8,
            max_tokens: 8192, 
        };
        commonHeaders['Authorization'] = `Bearer ${apiKey}`;
    } else {
        throw new Error('不支持的AI模型');
    }

    const response = await fetch(url, { method: 'POST', headers: commonHeaders, body: JSON.stringify(payload) });
    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`${model} API Error Body:`, errorBody);
        throw new Error(`${model} API error: ${response.statusText}`);
    }
    const data = await response.json();
    let rawText = model === 'gemini' ? data.candidates[0].content.parts[0].text : data.choices[0].message.content;
    
    let jsonString = rawText;
    const match = rawText.match(/```json\s*([\s\S]*?)\s*```|(\[.*\]|\{.*\})/s);
    if (match) jsonString = match[1] || match[2];

    return findArrayInJson(JSON.parse(jsonString));
}

function getBasePrompt(profiles, style) {
    const studentProfilesChunk = profiles.map(p => ` - 姓名: ${p.name}, 职务: ${p.role}, 具体事例: ${p.incidents}, 标签: ${p.tags}`).join('\n');
    const formatInstruction = `**输出格式**: 你的整个输出必须是一个JSON数组 [...]，数组中的每个对象都对应一个学生。不要在JSON数组前后添加任何说明性文字。`;
    return `你是一位顶级的中文教师和语言大师，现在需要为学生生成评语“蓝图”。
    **评语风格**: ${style}
    ---
    **核心指令 (必须严格遵守)**
    1. **结构化输出**: 对每个学生，都返回一个包含 'studentName', 'intro', 'body', 'conclusion' 四个键的JSON对象。'studentName' 必须是学生的姓名字符串。
    2. **姓名与代词规则 (绝对禁止违反)**: 在整个评语中，学生的全名只允许在 intro 部分出现一次。在 body 和 conclusion 部分，必须使用第二人称代词“你”。
    3. **内容融合规则 (高优先级)**: 如果学生档案的“职务”或“具体事例”字段不为'无'，你必须将这些信息作为评语的核心素材。
    ---
    **学生档案**:
    ${studentProfilesChunk}
    ---
    ${formatInstruction}`;
}

function findArrayInJson(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
        for (const key in data) {
            const result = findArrayInJson(data[key]);
            if (result) return result;
        }
    }
    return null;
}
