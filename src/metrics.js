const os = require('os');
const config = require('./config');

const activeUsers = new Map(); // userId -> lastSeenTimestamp
const ACTIVE_WINDOW_MS = 60 * 1000; // 1 minute

const requestCounts = {}; // key: "METHOD path" -> { method, path, count }
const latencies = {};     // key: "METHOD path" -> { method, path, sum, count }

let authSuccessCount = 0;
let authFailureCount = 0;

let pizzasSoldCount = 0;
let pizzaFailureCount = 0;
let revenueTotal = 0;
let pizzaLatencySum = 0;
let pizzaLatencyCount = 0;

function getCpuTimes() {
    let idle = 0;
    let total = 0;
    for (const cpu of os.cpus()) {
        for (const type in cpu.times) {
            total += cpu.times[type];
        }
        idle += cpu.times.idle;
    }
    return { idle, total };
}

let previous = getCpuTimes();

function getCpuUsagePercentage() {
    const current = getCpuTimes();
    const idleDiff = current.idle - previous.idle;
    const totalDiff = current.total - previous.total;
    previous = current;

    if (totalDiff === 0) return 0;
    return Number((100 * (1 - idleDiff / totalDiff)).toFixed(2));
}

function getMemoryUsagePercentage() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    return Number(((usedMemory / totalMemory) * 100).toFixed(2));
}

function trackActiveUser(userId) {
    if (!userId) return;
    activeUsers.set(userId, Date.now());
}

function getActiveUserCount() {
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    for (const [userId, lastSeen] of activeUsers) {
        if (lastSeen < cutoff) activeUsers.delete(userId);
    }
    return activeUsers.size;
}

function trackRequest({ method, path, statusCode, durationMs }) {
    const key = `${method} ${path} ${statusCode}`;

    if (!requestCounts[key]) requestCounts[key] = { method, path, statusCode, count: 0 };
    requestCounts[key].count += 1;

    const latencyKey = `${method} ${path}`;
    if (!latencies[latencyKey]) latencies[latencyKey] = { method, path, sum: 0, count: 0 };
    latencies[latencyKey].sum += durationMs;
    latencies[latencyKey].count += 1;
}

function trackAuthAttempt(success) {
    if (success) authSuccessCount++;
    else authFailureCount++;
}

function trackPizzaPurchase(success, latencyMs, price) {
    if (success) {
        pizzasSoldCount++;
        revenueTotal += price;
    } else {
        pizzaFailureCount++;
    }
    pizzaLatencySum += latencyMs;
    pizzaLatencyCount++;
}

function createMetric(metricName, metricValue, metricUnit, metricType, valueType, attributes) {
    attributes = { ...attributes, source: config.source };

    const dataPoint = {
        [valueType]: valueType === 'asInt' ? metricValue.toString() : metricValue,
        timeUnixNano: (Date.now() * 1000000).toString(),
        attributes: [],
    };

    const metric = {
        name: metricName,
        unit: metricUnit,
        [metricType]: { dataPoints: [dataPoint] },
    };

    Object.keys(attributes).forEach((key) => {
        metric[metricType].dataPoints[0].attributes.push({
            key,
            value: { stringValue: String(attributes[key]) },
        });
    });

    if (metricType === 'sum') {
        metric[metricType].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
        metric[metricType].isMonotonic = true;
    }

    return metric;
}

function buildHttpMetrics() {
    return Object.values(requestCounts).map(({ method, path, statusCode, count }) =>
        createMetric('requests', count, '1', 'sum', 'asInt', { method, endpoint: path, status: String(statusCode) }),
    );
}

function buildLatencyMetrics() {
    const metrics = [];

    Object.values(latencies).forEach(({ method, path, sum, count }) => {
        metrics.push(createMetric('service_endpoint_latency_sum', sum, 'ms', 'sum', 'asDouble', { method, endpoint: path }));
        metrics.push(createMetric('service_endpoint_latency_count', count, '1', 'sum', 'asInt', { method, endpoint: path }));
    });

    metrics.push(createMetric('pizza_creation_latency_sum', pizzaLatencySum, 'ms', 'sum', 'asDouble', {}));
    metrics.push(createMetric('pizza_creation_latency_count', pizzaLatencyCount, '1', 'sum', 'asInt', {}));

    return metrics;
}

function buildUserMetrics() {
    return [createMetric('active_users', getActiveUserCount(), '1', 'gauge', 'asInt', {})];
}

function buildAuthMetrics() {
    return [
        createMetric('auth_attempts', authSuccessCount, '1', 'sum', 'asInt', { success: 'success' }),
        createMetric('auth_attempts', authFailureCount, '1', 'sum', 'asInt', { success: 'failure' }),
    ];
}

function buildSystemMetrics() {
    return [
        createMetric('cpu_usage_percentage', getCpuUsagePercentage(), '%', 'gauge', 'asDouble', {}),
        createMetric('memory_usage_percentage', getMemoryUsagePercentage(), '%', 'gauge', 'asDouble', {}),
    ];
}

function buildPurchaseMetrics() {
    return [
        createMetric('pizzas_sold', pizzasSoldCount, '1', 'sum', 'asInt', {}),
        createMetric('pizza_creation_failures', pizzaFailureCount, '1', 'sum', 'asInt', {}),
        createMetric('pizza_revenue', revenueTotal, '1', 'sum', 'asDouble', {}),
    ];
}

function sendMetricToGrafana(metrics) {
    if (metrics.length === 0) return;

    const body = {
        resourceMetrics: [{ scopeMetrics: [{ metrics }] }],
    };

    fetch(`${config.endpointUrl}`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { Authorization: `Bearer ${config.accountId}:${config.apiKey}`, 'Content-Type': 'application/json' },
    })
        .then((response) => {
            if (!response.ok) {
                return response.text().then((text) => {
                    throw new Error(`HTTP status: ${response.status} - ${text}`);
                });
            }
            console.log(`Successfully pushed ${metrics.length} metric(s) to Grafana`);
        })
        .catch((error) => {
            console.error('Error pushing metrics:', error);
        });
}

function sendMetricsPeriodically(period) {
    setInterval(() => {
        try {
            const metrics = [
                ...buildHttpMetrics(),
                ...buildLatencyMetrics(),
                ...buildUserMetrics(),
                ...buildAuthMetrics(),
                ...buildSystemMetrics(),
                ...buildPurchaseMetrics(),
            ];
            sendMetricToGrafana(metrics);
        } catch (error) {
            console.log('Error sending metrics', error);
        }
    }, period);
}

sendMetricsPeriodically(10000);

module.exports = {
    trackRequest,
    trackAuthAttempt,
    trackActiveUser,
    trackPizzaPurchase,
};