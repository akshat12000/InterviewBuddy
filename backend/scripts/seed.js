require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const Problem = require('../src/models/Problem');

async function run() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/interview_app';
  await mongoose.connect(mongoUri);

  await User.deleteMany({});
  await Problem.deleteMany({});

  const interviewer = await User.create({
    name: 'Interviewer One',
    email: 'interviewer@example.com',
    password: await bcrypt.hash('password', 10),
    role: 'interviewer',
    bio: 'Experienced engineer'
  });

  const candidate = await User.create({
    name: 'Candidate One',
    email: 'candidate@example.com',
    password: await bcrypt.hash('password', 10),
    role: 'candidate',
    bio: 'Aspiring developer'
  });

  const problem = await Problem.create({
    title: 'Two Sum',
    slug: 'two-sum',
    difficulty: 'easy',
    statement: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    starterCode: 'function twoSum(nums, target) {\n // your code here\n}',
    tags: ['array', 'hashmap']
  });

  console.log('Seeded:', { interviewer: interviewer.email, candidate: candidate.email, problem: problem.slug });
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
