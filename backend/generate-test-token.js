const jwt = require('jsonwebtoken');
require('dotenv').config();

const payload = {
  userId: 'cmfznf7np0000hfo3d6tqk3va',
  email: 'kewalgosrani@gmail.com'
};

const secret = process.env.JWT_SECRET || 'your-super-secure-jwt-secret-key-change-this-in-production';
const token = jwt.sign(payload, secret, { expiresIn: '1h' });

console.log('Generated JWT token:');
console.log(token);