const fs = require('fs');
const path = require('path');
const readline = require('readline');

// The Sacred Gold Reference
const RUNS_DIR = path.join(__dirname, '..', 'data', 'runs');

// Helper to stream JSONL
async function streamJsonl(filePath, processLine) {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    for await (const line of rl) {
        if (!line.trim()) continue;
        try { processLine(JSON.parse(line)); } catch(e) { }
    }
}

// Compute metrics for a single run
async function computeRunMetrics(runFilePath) {
    const metrics = {
        total_events: 0,
        errors: 0,
        timing_sum: 0,
        timing_count: 0,
        
        // mode -> context -> count
        contexts: { vanilla: {top:0,iframe:0,worker:0}, compat: {top:0,iframe:0,worker:0}, privacy: {top:0,iframe:0,worker:0} },
        
        // mode -> site -> context -> epoch -> components
        epochs: { vanilla: {}, compat: {}, privacy: {} }
    };

    await streamJsonl(runFilePath, (event) => {
        metrics.total_events++;
        
        if (event.event_type === 'error') {
            metrics.errors++;
            return;
        }

        if (event.event_type === 'fingerprint_vector') {
            const { url, context, epoch, components, timings } = event;
            const mode = event.mode || 'privacy';
            const site = new URL(url).hostname;
            
            if (!metrics.contexts[mode]) metrics.contexts[mode] = {top:0,iframe:0,worker:0};
            metrics.contexts[mode][context] = (metrics.contexts[mode][context] || 0) + 1;
            
            if (timings) {
                metrics.timing_sum += timings;
                metrics.timing_count++;
            }

            if (!metrics.epochs[mode]) metrics.epochs[mode] = {};
            if (!metrics.epochs[mode][site]) metrics.epochs[mode][site] = {};
            if (!metrics.epochs[mode][site][context]) metrics.epochs[mode][site][context] = {};
            if (!metrics.epochs[mode][site][context][epoch]) metrics.epochs[mode][site][context][epoch] = [];
            
            metrics.epochs[mode][site][context][epoch].push(components);
        }
    });

    metrics.avg_timing = metrics.timing_count > 0 ? (metrics.timing_sum / metrics.timing_count) : 0;
    return metrics;
}

// Analyze Drift/Stability across Epochs
function analyzeDrift(metrics) {
    const driftReport = {};

    for (const mode in metrics.epochs) {
        driftReport[mode] = {
            top: { canvas: { stable: 0, drifted: 0 }, webgl: { stable: 0, drifted: 0 }, audio: { stable: 0, drifted: 0 } },
            worker: { canvas: { stable: 0, drifted: 0 }, webgl: { stable: 0, drifted: 0 }, audio: { stable: 0, drifted: 0 } },
            iframe: { canvas: { stable: 0, drifted: 0 }, webgl: { stable: 0, drifted: 0 }, audio: { stable: 0, drifted: 0 } }
        };

        for (const site in metrics.epochs[mode]) {
            for (const context in metrics.epochs[mode][site]) {
                const epochs = metrics.epochs[mode][site][context];
                const epochKeys = Object.keys(epochs).sort();
                
                if (epochKeys.length < 2) continue; 

                const firstKey = epochKeys[0];
                const lastKey = epochKeys[epochKeys.length - 1];

                const e1Comp = epochs[firstKey][0]; 
                const eNComp = epochs[lastKey][0];

                if (e1Comp && eNComp) {
                    if (e1Comp.canvas_imagedata_hash === eNComp.canvas_imagedata_hash) driftReport[mode][context].canvas.stable++;
                    else driftReport[mode][context].canvas.drifted++;

                    if (e1Comp.webgl_hash === eNComp.webgl_hash) driftReport[mode][context].webgl.stable++;
                    else driftReport[mode][context].webgl.drifted++;

                    if (e1Comp.audio_hash === eNComp.audio_hash) driftReport[mode][context].audio.stable++;
                    else driftReport[mode][context].audio.drifted++;
                }
            }
        }
    }
    return driftReport;
}

// Evaluate pass/fail against strict rules
function evaluateTargetProfile(metrics, drift) {
    const reasons = [];

    const errorRate = metrics.errors / (metrics.total_events || 1);
    if (errorRate > 0.4) {
        reasons.push(`Failure: Massive error flood (${(errorRate * 100).toFixed(1)}%)`);
    }

    if (metrics.avg_timing > 500) {
        reasons.push(`Failure: Runaway timings (Avg: ${metrics.avg_timing.toFixed(1)}ms)`);
    }

    function checkStable(mode, context, signal, requiredRate = 1.0) {
        const bucket = drift?.[mode]?.[context]?.[signal];
        if (!bucket) {
            reasons.push(`Failure: Missing ${mode}/${context}/${signal} bucket`);
            return;
        }
        const total = bucket.stable + bucket.drifted;
        if (total === 0) {
            reasons.push(`Failure: No observations for ${mode}/${context}/${signal}`);
            return;
        }
        const stableRate = bucket.stable / total;
        if (stableRate < requiredRate) {
            reasons.push(
                `Failure: ${mode}/${context}/${signal} stable rate ${(stableRate * 100).toFixed(1)}% < ${(requiredRate * 100).toFixed(1)}%`
            );
        }
    }

    function checkDrift(mode, context, signal, requiredRate = 1.0) {
        const bucket = drift?.[mode]?.[context]?.[signal];
        if (!bucket) {
            reasons.push(`Failure: Missing ${mode}/${context}/${signal} bucket`);
            return;
        }
        const total = bucket.stable + bucket.drifted;
        if (total === 0) {
            reasons.push(`Failure: No observations for ${mode}/${context}/${signal}`);
            return;
        }
        const driftRate = bucket.drifted / total;
        if (driftRate < requiredRate) {
            reasons.push(
                `Failure: ${mode}/${context}/${signal} drift rate ${(driftRate * 100).toFixed(1)}% < ${(requiredRate * 100).toFixed(1)}%`
            );
        }
    }

    function requireCoverage(mode, context, minCount = 1) {
        const count = metrics.contexts?.[mode]?.[context] || 0;
        if (count < minCount) {
            reasons.push(`Failure: ${mode}/${context} coverage too low (${count})`);
        }
    }

    const strictSignals = ['canvas', 'webgl'];
    const fullContexts = ['top', 'worker'];

    for (const mode of ['vanilla', 'compat']) {
        for (const context of fullContexts) {
            requireCoverage(mode, context, 1);
            for (const signal of strictSignals) {
                checkStable(mode, context, signal, 1.0);
            }
        }
    }

    for (const context of fullContexts) {
        requireCoverage('privacy', context, 1);
        for (const signal of strictSignals) {
            checkDrift('privacy', context, signal, 1.0);
        }
    }

    const iframeSignals = ['canvas', 'webgl'];

    for (const mode of ['vanilla', 'compat']) {
        if ((metrics.contexts?.[mode]?.iframe || 0) > 0) {
            for (const signal of iframeSignals) {
                checkStable(mode, 'iframe', signal, 0.80);
            }
        }
    }

    if ((metrics.contexts?.privacy?.iframe || 0) > 0) {
        for (const signal of iframeSignals) {
            checkDrift('privacy', 'iframe', signal, 0.80);
        }
    }

    return {
        passed: reasons.length === 0,
        reasons
    };
}

async function runEvaluation(targetRunId, goldRunId = null) {
    console.log(`\n==============================================`);
    console.log(`🛡️ PAL RESEARCH GATE EVALUATOR`);
    console.log(`==============================================\n`);

    let goldMetrics = null;
    let goldDrift = null;

    if (goldRunId) {
        const goldFile = path.join(RUNS_DIR, goldRunId, `run_${goldRunId}.jsonl`);
        if (fs.existsSync(goldFile)) {
            console.log(`Analyzing GOLD Reference Run (${goldRunId})...`);
            goldMetrics = await computeRunMetrics(goldFile);
            goldDrift = analyzeDrift(goldMetrics);
        } else {
            console.log(`Gold run not found for ${goldRunId}. Continuing without baseline.`);
        }
    }

    const targetFile = path.join(RUNS_DIR, targetRunId, `run_${targetRunId}.jsonl`);
    if (!fs.existsSync(targetFile)) {
        console.error(`❌ Target Run not found: ${targetFile}`);
        process.exit(1);
    }

    console.log(`Analyzing TARGET Run (${targetRunId})...`);
    const targetMetrics = await computeRunMetrics(targetFile);
    const targetDrift = analyzeDrift(targetMetrics);
    require('fs').writeFileSync('drift_output.json', JSON.stringify(targetDrift, null, 2));

    const evaluation = evaluateTargetProfile(targetMetrics, targetDrift);

    // ── Coverage Summary ──────────────────────────────────────────────────────
    console.log(`\n╔═══════════════════════════════════════════════════════╗`);
    console.log(`║              PAL RESEARCH SUMMARY REPORT              ║`);
    console.log(`╚═══════════════════════════════════════════════════════╝`);

    const totalEvents = targetMetrics.total_events;
    const errors = targetMetrics.errors;
    const errorPct = ((errors / (totalEvents || 1)) * 100).toFixed(1);
    const avgTiming = targetMetrics.avg_timing.toFixed(1);

    function coverageCounts(metrics) {
        const counts = {};
        for (const mode of ['vanilla', 'compat', 'privacy']) {
            counts[mode] = { top: new Set(), iframe: new Set(), worker: new Set() };
            const modeEpochs = metrics.epochs[mode] || {};
            for (const site in modeEpochs) {
                for (const ctx of ['top', 'iframe', 'worker']) {
                    if (modeEpochs[site][ctx]) counts[mode][ctx].add(site);
                }
            }
        }
        return counts;
    }
    const cov = coverageCounts(targetMetrics);

    console.log(`\n── SITE COVERAGE ──────────────────────────────────────`);
    console.log(`  ${'MODE'.padEnd(10)} ${'TOP'.padEnd(6)} ${'IFRAME'.padEnd(8)} ${'WORKER'}`);
    console.log(`  ${'─'.repeat(35)}`);
    for (const mode of ['vanilla', 'compat', 'privacy']) {
        const t = cov[mode].top.size;
        const i = cov[mode].iframe.size;
        const w = cov[mode].worker.size;
        console.log(`  ${mode.padEnd(10)} ${String(t).padEnd(6)} ${String(i).padEnd(8)} ${w}`);
    }

    console.log(`\n── DRIFT RATES BY CONTEXT & MODE ──────────────────────`);
    const signals = ['canvas', 'webgl', 'audio'];
    const ctxs = ['top', 'iframe', 'worker'];
    for (const mode of ['vanilla', 'compat', 'privacy']) {
        const d = targetDrift[mode];
        if (!d) continue;
        console.log(`\n  [${mode.toUpperCase()}]`);
        console.log(`    ${'CONTEXT'.padEnd(8)} ${'SIGNAL'.padEnd(8)} ${'STABLE'.padEnd(8)} ${'DRIFTED'.padEnd(9)} ${'DRIFT%'}`);
        console.log(`    ${'─'.repeat(46)}`);
        for (const ctx of ctxs) {
            for (const sig of signals) {
                const s = d[ctx]?.[sig]?.stable ?? 0;
                const dr = d[ctx]?.[sig]?.drifted ?? 0;
                const total = s + dr;
                const pct = total > 0 ? ((dr / total) * 100).toFixed(0) + '%' : 'N/A';
                const flag = total === 0 ? '–' :
                    (mode === 'privacy' && dr > 0) ? '✅' :
                    (mode !== 'privacy' && dr === 0) ? '✅' : '❌';
                console.log(`    ${ctx.padEnd(8)} ${sig.padEnd(8)} ${String(s).padEnd(8)} ${String(dr).padEnd(9)} ${pct.padEnd(6)} ${flag}`);
            }
        }
    }

    console.log(`\n── BREAKAGE & TIMING ──────────────────────────────────`);
if (goldMetrics) {
    console.log(`  Total Events:   ${totalEvents}  (Gold baseline: ${goldMetrics.total_events})`);
} else {
    console.log(`  Total Events:   ${totalEvents}`);
}

console.log(`  Errors:         ${errors}  (${errorPct}%)`);

if (goldMetrics) {
    console.log(`  Avg Probe Time: ${avgTiming}ms  (Gold: ${goldMetrics.avg_timing.toFixed(1)}ms)`);
    const timingDelta = (targetMetrics.avg_timing - goldMetrics.avg_timing).toFixed(1);
    const timingFlag = Math.abs(parseFloat(timingDelta)) < 100
        ? '✅ Within acceptable range'
        : '⚠️ Timing spike vs Gold';
    console.log(`  Timing Delta:   ${parseFloat(timingDelta) > 0 ? '+' : ''}${timingDelta}ms  ${timingFlag}`);
} else {
    console.log(`  Avg Probe Time: ${avgTiming}ms`);
    console.log(`  Timing Delta:   Not computed`);
}

    console.log(`\n── VERDICT ────────────────────────────────────────────`);
    if (evaluation.passed) {
        console.log(`  ✅ PASS: Run meets target profile.`);
    } else {
        console.log(`  ❌ FAIL: Run rejected.`);
        evaluation.reasons.forEach(r => console.log(`     -> ${r}`));
    }
    console.log(`\n${'═'.repeat(55)}\n`);
}

async function main() {
    const target = process.argv[2];
    const gold = process.argv[3] || null;

    if (!target) {
        console.log('Usage: node research_gate_evaluator.js <run_id> [gold_run_id]');
    } else {
        await runEvaluation(target, gold);
    }
}

main();

