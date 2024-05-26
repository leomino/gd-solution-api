import { sign } from 'hono/jwt';
import { JWTPayload } from 'hono/utils/jwt/types';

export const createJWT = async (firebaseIdToken: string, username: string): Promise<string> => {
  const payload: JWTPayload = {
    sub: username,
    user_id: firebaseIdToken,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    role: 'user',
  };
  const jwt_secret = process.env.JWT_SECRET;
  if (!jwt_secret) {
    throw new Error('jwt secret seems to be missing.');
  }
  return await sign(payload, jwt_secret);
};
