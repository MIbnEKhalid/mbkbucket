/**
 * MBKBucket
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 * Source: https://github.com/MIbnEKhalid/mbkbucket
 */

import express from "express";
import { sessRole } from "mbkauthe";
import { bucketResolver } from "../middleware/bucket-resolver.js";
import { renderBucketDashboard } from "../controllers/dashboard.controller.js";
import infoRoutes from "./info.routes.js";
import { createViewRoutes } from "./view.routes.js";
import { createApiRoutes } from "./api.routes.js";

export function createBucketRouter({ authorization } = {}) {
	const router = express.Router();
	const defaultAuthorization = sessRole('superadmin');
	const authorizations = typeof authorization === 'function'
		? { view: authorization, upload: authorization, delete: authorization }
		: authorization || {};
	const viewAuthorization = authorizations.view || defaultAuthorization;
	const uploadAuthorization = authorizations.upload || defaultAuthorization;
	const deleteAuthorization = authorizations.delete || defaultAuthorization;

	router.get('/mbkbucket', viewAuthorization, renderBucketDashboard);
	router.use(
		'/mbkbucket',
		bucketResolver,
		infoRoutes,
		createViewRoutes({ authorization: viewAuthorization }),
		createApiRoutes({ viewAuthorization, uploadAuthorization, deleteAuthorization }),
	);

	return router;
}

const router = createBucketRouter();

export default router;
