import express from 'express';

export const authenticateSync = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.sendStatus(401); // Unauthorized
    }

    if (token === process.env.INTERNAL_SYNC_TOKEN) {
        next(); // Token is valid, proceed
    } else {
        return res.sendStatus(403); // Forbidden
    }
};