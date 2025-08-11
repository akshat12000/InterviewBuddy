require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const Problem = require('../src/models/Problem');
const Session = require('../src/models/Session');

function rid() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  )
}

async function run() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/interview_app';
  await mongoose.connect(mongoUri);

  // Clean existing data
  await Promise.all([
    User.deleteMany({}),
    Problem.deleteMany({}),
    Session.deleteMany({}),
  ]);

  // Seed users
  const users = [];
  const mkUser = async (name, email, role, bio) => {
    const u = await User.create({
      name,
      email,
      password: await bcrypt.hash('password', 10),
      role,
      bio,
    });
    users.push(u);
    return u;
  };

  const interviewer1 = await mkUser('Interviewer One', 'interviewer@example.com', 'interviewer', 'Experienced engineer');
  const interviewer2 = await mkUser('Interviewer Two', 'interviewer2@example.com', 'interviewer', 'Senior engineer and mentor');
  const candidate1 = await mkUser('Candidate One', 'candidate@example.com', 'candidate', 'Aspiring developer');
  const candidate2 = await mkUser('Candidate Two', 'candidate2@example.com', 'candidate', 'Frontend enthusiast');
  const candidate3 = await mkUser('Candidate Three', 'candidate3@example.com', 'candidate', 'Backend tinkerer');

  // Seed problems
  const problemsData = [
    {
      title: 'Two Sum', slug: 'two-sum', difficulty: 'easy',
      statement: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
      starterCode: 'function twoSum(nums, target) {\n // your code here\n}', tags: ['array', 'hashmap']
    },
    {
      title: 'Valid Parentheses', slug: 'valid-parentheses', difficulty: 'easy',
      statement: 'Given a string s containing just the characters ( ) { } [ ], determine if the input string is valid.',
      starterCode: 'function isValid(s) {\n // your code here\n}', tags: ['stack', 'string']
    },
    {
      title: 'Merge Intervals', slug: 'merge-intervals', difficulty: 'medium',
      statement: 'Given an array of intervals where intervals[i] = [starti, endi], merge all overlapping intervals.',
      starterCode: 'function merge(intervals) {\n // your code here\n}', tags: ['array', 'sorting']
    },
    {
      title: 'Number of Islands', slug: 'number-of-islands', difficulty: 'medium',
      statement: 'Given an m x n 2D binary grid grid, return the number of islands.',
      starterCode: 'function numIslands(grid) {\n // your code here\n}', tags: ['dfs', 'bfs', 'graph']
    },
    {
      title: 'LRU Cache', slug: 'lru-cache', difficulty: 'hard',
      statement: 'Design a data structure that follows the constraints of a Least Recently Used (LRU) cache.',
      starterCode: 'class LRUCache {\n constructor(capacity) {\n }\n get(key) {\n }\n put(key, value) {\n }\n}', tags: ['design', 'hashmap', 'linked-list']
    },
    {
      title: 'Word Ladder', slug: 'word-ladder', difficulty: 'hard',
      statement: 'Given two words, beginWord and endWord, and a dictionary wordList, return the length of the shortest transformation sequence.',
      starterCode: 'function ladderLength(beginWord, endWord, wordList) {\n // your code here\n}', tags: ['bfs', 'graph']
    }
  ];

  const problems = await Problem.insertMany(problemsData);

  // Seed sessions
  const sessions = [];
  const mkSession = async ({ interviewer, candidate, problem, status = 'scheduled' }) => {
    const s = await Session.create({
      interviewer: interviewer._id,
      candidate: candidate._id,
      problem: problem._id,
      status,
      roomId: rid(),
      interviewerScores: status === 'completed' ? [
        { criterion: 'Problem Solving', score: 7, notes: 'Decent approach' },
        { criterion: 'Code Quality', score: 6 },
        { criterion: 'Communication', score: 8 }
      ] : [],
      finalDecision: status === 'completed' ? 'selected' : undefined,
      notes: status === 'completed' ? 'Promising candidate' : undefined,
      codeSnapshots: status !== 'scheduled' ? [
        { code: '// initial', language: 'javascript' },
        { code: '// refined', language: 'javascript' }
      ] : []
    });
    sessions.push(s);
    return s;
  };

  await mkSession({ interviewer: interviewer1, candidate: candidate1, problem: problems[0], status: 'scheduled' });
  await mkSession({ interviewer: interviewer1, candidate: candidate2, problem: problems[2], status: 'live' });
  await mkSession({ interviewer: interviewer2, candidate: candidate3, problem: problems[4], status: 'completed' });
  await mkSession({ interviewer: interviewer2, candidate: candidate1, problem: problems[1], status: 'scheduled' });

  console.log('Seeded users:', users.map(u => `${u.role}:${u.email}`).join(', '));
  console.log('Seeded problems:', problems.map(p => p.slug).join(', '));
  console.log('Seeded sessions:', sessions.map(s => `${s.status}:${s.roomId}`).join(', '));

  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
