import { Hono } from 'hono';
import signInRoute from './routes/signin';
import signUpRoute from './routes/signup';

const authRoutes = new Hono();
authRoutes.route('/signin', signInRoute);
authRoutes.route('/signup', signUpRoute);

export default authRoutes;
