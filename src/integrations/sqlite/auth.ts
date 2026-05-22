import { hash, compare } from 'bcryptjs';
import { sign, verify } from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { getDb } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export async function signUp(email: string, password: string): Promise<AuthResponse> {
  const db = getDb();
  
  // Check if user exists
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    throw new Error('User already exists');
  }

  const userId = randomBytes(16).toString('hex');
  const passwordHash = await hash(password, 10);
  const now = new Date().toISOString();

  // Create user
  db.prepare(`
    INSERT INTO users (id, email, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, email, passwordHash, now, now);

  // Assign role (first user is admin, others are employees)
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
  const role = userCount === 1 ? 'admin' : 'employee';
  
  db.prepare(`
    INSERT INTO user_roles (id, user_id, role, created_at)
    VALUES (?, ?, ?, ?)
  `).run(randomBytes(16).toString('hex'), userId, role, now);

  const token = sign({ userId, email, role }, JWT_SECRET, { expiresIn: '7d' });
  
  return {
    token,
    user: { id: userId, email }
  };
}

export async function signIn(email: string, password: string): Promise<AuthResponse> {
  const db = getDb();
  
  const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email) as any;
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isValid = await compare(password, user.password_hash);
  if (!isValid) {
    throw new Error('Invalid credentials');
  }

  const role = (db.prepare('SELECT role FROM user_roles WHERE user_id = ?').get(user.id) as any)?.role || 'employee';
  const token = sign({ userId: user.id, email, role }, JWT_SECRET, { expiresIn: '7d' });

  return {
    token,
    user: { id: user.id, email }
  };
}

export function verifyToken(token: string): any {
  try {
    return verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
}

export function getUserFromToken(token: string): { userId: string; email: string; role: string } {
  const decoded = verifyToken(token);
  return {
    userId: decoded.userId,
    email: decoded.email,
    role: decoded.role
  };
}
