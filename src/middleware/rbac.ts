import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { employees } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const requireManager = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.headers['x-user-id'] as string;
  
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized: Missing X-User-Id header' });
    return;
  }
  
  try {
    const user = await db.select().from(employees).where(eq(employees.id, userId)).limit(1);
    
    if (user.length === 0) {
      res.status(401).json({ error: 'Unauthorized: User not found' });
      return;
    }
    
    if (user[0].role !== 'manager') {
      res.status(403).json({ error: 'Forbidden: Requires manager role' });
      return;
    }
    
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};
