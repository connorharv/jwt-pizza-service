const metrics = require('./metrics');

function requestTracker(req, res, next) {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        const path = req.route ? `${req.baseUrl}${req.route.path}` : req.path;

        metrics.trackRequest({
            method: req.method,
            path,
            statusCode: res.statusCode,
            durationMs,
        });
    });

    if (req.user?.id) {
        metrics.trackActiveUser(req.user.id);
    }

    next();
}

module.exports = { requestTracker };