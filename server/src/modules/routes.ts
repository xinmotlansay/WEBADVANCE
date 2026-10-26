import { Router } from 'express';
import { bannerRoutes } from './banners/banner.routes.js';
import { categoryRoutes } from './categories/category.routes.js';
import { collectionRoutes } from './collections/collection.routes.js';
import { configRoutes } from './config/config.routes.js';
import { inspirationRoutes } from './inspirations/inspiration.routes.js';
import { productRoutes } from './products/product.routes.js';
import { promotionRoutes } from './promotions/promotion.routes.js';
import { showroomRoutes } from './showrooms/showroom.routes.js';

export const apiRoutes = Router();

apiRoutes.use('/banners', bannerRoutes);
apiRoutes.use('/categories', categoryRoutes);
apiRoutes.use('/collections', collectionRoutes);
apiRoutes.use('/config', configRoutes);
apiRoutes.use('/inspirations', inspirationRoutes);
apiRoutes.use('/products', productRoutes);
apiRoutes.use('/promotions', promotionRoutes);
apiRoutes.use('/showrooms', showroomRoutes);
