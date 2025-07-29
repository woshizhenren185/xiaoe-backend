// server.js - 小鹅评语机后端服务
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'xiaoe-secret-key-2024';

// 中间件
app.use(cors());
app.use(express.json());

// 内存数据库（生产环境建议使用真实数据库）
let users = {};
let orders = {};

// 辅助函数
const generateComment = async (profile, style, model) => {
    // 这里集成真实的AI API
    const { name, role, tags, incidents } = profile;
    
    // 模拟AI生成的评语结构
    const templates = {
        亲切鼓励: {
            intro: [`${name}同学，你是老师心目中的好学生！`, `亲爱的${name}，这学期你的表现让老师印象深刻。`],
            positive: {
                '尊敬师长': '你总是礼貌待人，对老师同学都很有礼貌',
                '遵守纪律': '你严格遵守班级纪律，是同学们的好榜样',
                '集体荣誉感强': '你热爱班集体，积极为班级争光',
                '乐于助人': '你乐于帮助同学，是大家的贴心小伙伴',
                '学习标兵': '你学习认真刻苦，成绩优异',
                '课堂活跃': '你在课堂上积极发言，思维活跃',
                '书写工整': '你的字迹工整美观，作业完成得很棒',
                '劳动积极': '你热爱劳动，总是主动承担班级事务'
            },
            negative: {
                '学习动力不足': '希望你能找到学习的乐趣，更加主动地投入学习',
                '需更细心': '如果你能更加细心一些，相信会有更大的进步',
                '有待进步': '相信通过努力，你一定能取得更好的成绩'
            },
            personality: {
                '活泼开朗': '你性格开朗，总能给大家带来欢乐',
                '沉稳内敛': '你性格沉稳，做事很有条理',
                '乐于思考': '你善于思考，经常有独特的见解',
                '心地善良': '你心地善良，待人真诚',
                '富有创意': '你思维活跃，总有很多创意想法'
            },
            conclusion: ['继续保持，你会更加优秀的！', '老师相信你会有更大的进步！', '加油，你是最棒的！']
        },
        正式客观: {
            intro: [`${name}同学本学期表现如下：`, `对${name}同学本学期的综合评价：`],
            positive: {
                '尊敬师长': '该生尊敬师长，待人有礼',
                '遵守纪律': '该生严格遵守校纪班规',
                '集体荣誉感强': '该生具有较强的集体荣誉感',
                '乐于助人': '该生乐于助人，与同学关系融洽',
                '学习标兵': '该生学习态度端正，成绩优良',
                '课堂活跃': '该生课堂参与度高，思维敏捷',
                '书写工整': '该生书写规范，作业质量较高',
                '劳动积极': '该生热爱劳动，责任心强'
            },
            negative: {
                '学习动力不足': '建议该生提高学习主动性',
                '需更细心': '建议该生在学习中更加仔细认真',
                '有待进步': '该生仍有较大提升空间'
            },
            personality: {
                '活泼开朗': '该生性格开朗，适应能力强',
                '沉稳内敛': '该生性格沉稳，做事踏实',
                '乐于思考': '该生思维能力较强，善于分析',
                '心地善良': '该生品德良好，为人正直',
                '富有创意': '该生思维活跃，具有创新精神'
            },
            conclusion: ['希望该生继续努力，争取更大进步。', '相信该生会有更好的发展。', '期待该生在新学期有更优异的表现。']
        }
    };

    const template = templates[style] || templates['亲切鼓励'];
    
    // 随机选择开场白
    const intro = template.intro[Math.floor(Math.random() * template.intro.length)];
    
    // 根据标签生成主体段落
    const tagList = tags.split('，').filter(tag => tag !== '无' && tag.trim() !== '');
    const body = [];
    
    tagList.forEach(tagName => {
        const trimmedTag = tagName.trim();
        if (template.positive[trimmedTag]) {
            body.push({
                source: trimmedTag,
                text: template.positive[trimmedTag]
            });
        } else if (template.negative[trimmedTag]) {
            body.push({
                source: trimmedTag,
                text: template.negative[trimmedTag]
            });
        } else if (template.personality[trimmedTag]) {
            body.push({
                source: trimmedTag,
                text: template.personality[trimmedTag]
            });
        }
    });

    // 处理班干部角色
    if (role && role !== '无') {
        body.push({
            source: '班干部',
            text: style === '亲切鼓励' ? 
                `作为${role}，你认真负责，是老师的得力助手。` :
                `担任${role}期间，该生工作认真负责。`
        });
    }

    // 处理具体事例
    if (incidents && incidents !== '无') {
        const incidentList = incidents.split('；').filter(inc => inc.trim() !== '');
        incidentList.forEach(incident => {
            body.push({
                source: '具体事例',
                text: style === '亲切鼓励' ? 
                    `在${incident}方面表现突出，值得表扬。` :
                    `在${incident}方面有良好表现。`
            });
        });
    }

    // 随机选择结语
    const conclusion = template.conclusion[Math.floor(Math.random() * template.conclusion.length)];

    return {
        studentName: name,
        intro,
        body,
        conclusion
    };
};

const generateAlternatives = async (originalText, sourceTag, style, model) => {
    // 模拟生成备选文本
    const alternatives = {
        '开场白': [
            '这学期你的表现让老师非常欣慰',
            '你是一个让老师印象深刻的学生',
            '通过这学期的观察，老师发现你是个很棒的孩子'
        ],
        '尊敬师长': [
            '你对老师总是很有礼貌，这点很难得',
            '你尊敬师长的品质值得同学们学习',
            '你懂得尊重他人，这是很好的品德'
        ],
        '学习标兵': [
            '你在学习上很用功，成绩一直保持优秀',
            '你学习态度认真，是同学们的好榜样',
            '你对知识的渴望和认真的态度让老师很欣慰'
        ],
        '总结': [
            '希望你继续保持，越来越优秀！',
            '相信你会在新的学期里有更大的收获！',
            '老师期待看到你更加精彩的表现！'
        ]
    };

    return alternatives[sourceTag] || [
        '你的表现值得肯定',
        '希望你能继续努力',
        '相信你会做得更好'
    ];
};

// API路由

// 用户注册
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ message: '用户名和密码不能为空' });
        }

        if (users[username]) {
            return res.status(400).json({ message: '用户名已存在' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        users[username] = {
            username,
            password: hashedPassword,
            credits: 50, // 注册赠送50点
            createdAt: new Date(),
            lastLogin: new Date()
        };

        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: '注册成功',
            user: {
                username,
                credits: 50
            },
            token
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: '注册失败，请稍后重试' });
    }
});

// 用户登录
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ message: '用户名和密码不能为空' });
        }

        const user = users[username];
        if (!user) {
            return res.status(401).json({ message: '用户不存在' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ message: '密码错误' });
        }

        user.lastLogin = new Date();
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: '登录成功',
            user: {
                username: user.username,
                credits: user.credits
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: '登录失败，请稍后重试' });
    }
});

// 获取用户信息
app.get('/api/user/:username', (req, res) => {
    try {
        const { username } = req.params;
        const user = users[username];
        
        if (!user) {
            return res.status(404).json({ message: '用户不存在' });
        }

        res.json({
            user: {
                username: user.username,
                credits: user.credits
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ message: '获取用户信息失败' });
    }
});

// 生成评语
app.post('/api/generate-comment', async (req, res) => {
    try {
        const { studentProfiles, commentStyle, model, username } = req.body;
        
        if (!username || !users[username]) {
            return res.status(401).json({ message: '用户未登录' });
        }

        const user = users[username];
        const requiredCredits = studentProfiles.length;

        if (user.credits < requiredCredits) {
            return res.status(400).json({ message: `点数不足！需要 ${requiredCredits} 点，剩余 ${user.credits} 点。` });
        }

        // 扣除点数
        user.credits -= requiredCredits;

        // 生成评语
        const results = [];
        for (const profile of studentProfiles) {
            const comment = await generateComment(profile, commentStyle, model);
            results.push(comment);
        }

        res.json(results);
    } catch (error) {
        console.error('Generate comment error:', error);
        res.status(500).json({ message: 'AI服务暂时不可用，请稍后重试' });
    }
});

// 生成备选方案
app.post('/api/generate-alternatives', async (req, res) => {
    try {
        const { originalText, sourceTag, commentStyle, model, username } = req.body;
        
        if (!username || !users[username]) {
            return res.status(401).json({ message: '用户未登录' });
        }

        const user = users[username];
        if (user.credits < 1) {
            return res.status(400).json({ message: '点数不足，无法生成备选方案' });
        }

        // 扣除1点数
        user.credits -= 1;

        const alternatives = await generateAlternatives(originalText, sourceTag, commentStyle, model);
        res.json(alternatives);
    } catch (error) {
        console.error('Generate alternatives error:', error);
        res.status(500).json({ message: '生成备选方案失败，请稍后重试' });
    }
});

// 创建支付宝订单（模拟）
app.post('/api/create-alipay-order', async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username || !users[username]) {
            return res.status(401).json({ message: '用户未登录' });
        }

        const orderId = uuidv4();
        orders[orderId] = {
            orderId,
            username,
            amount: 25,
            credits: 50,
            status: 'pending',
            createdAt: new Date()
        };

        // 模拟支付链接（实际应该调用支付宝API）
        const payUrl = `https://example-alipay.com/pay?order_id=${orderId}&amount=25`;

        // 模拟支付成功（5秒后自动完成支付，仅用于演示）
        setTimeout(() => {
            if (orders[orderId] && orders[orderId].status === 'pending') {
                orders[orderId].status = 'paid';
                if (users[username]) {
                    users[username].credits += 50;
                }
            }
        }, 5000);

        res.json({
            orderId,
            payUrl,
            amount: 25,
            credits: 50
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ message: '创建订单失败，请稍后重试' });
    }
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date(),
        users: Object.keys(users).length,
        orders: Object.keys(orders).length
    });
});

// 根路径
app.get('/', (req, res) => {
    res.json({
        message: '小鹅评语机后端服务运行中',
        version: '1.0.0',
        endpoints: [
            'POST /api/register - 用户注册',
            'POST /api/login - 用户登录',
            'GET /api/user/:username - 获取用户信息',
            'POST /api/generate-comment - 生成评语',
            'POST /api/generate-alternatives - 生成备选方案',
            'POST /api/create-alipay-order - 创建支付订单',
            'GET /health - 健康检查'
        ]
    });
});

// 错误处理中间件
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ message: '服务器内部错误' });
});

// 404处理
app.use((req, res) => {
    res.status(404).json({ message: '接口不存在' });
});

app.listen(PORT, () => {
    console.log(`小鹅评语机后端服务已启动，端口: ${PORT}`);
    console.log(`访问 http://localhost:${PORT} 查看API文档`);
});
