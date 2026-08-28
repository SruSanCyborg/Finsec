/**
 * L2-regularised logistic regression, fitted by gradient descent.
 *
 * The detector started as Naive Bayes on log-odds: each feature contributes
 * log(P(f|uplift) / P(f|not)) and the contributions are summed as though the
 * features were independent. They are not. `rail` and `failure_code` are
 * strongly correlated — a NACH mandate fails for different reasons than a card
 * does — so the same evidence was being counted twice, and the scores came out
 * over-confident in exactly the region where records cluster.
 *
 * Naming the interactions (`failure×rail`) made that worse rather than better:
 * Naive Bayes then counts `failure`, `rail`, *and* the pair, tripling the
 * weight of one fact. Logistic regression is the fix, not a fashion — it learns
 * one joint set of coefficients, so a correlated pair shares the weight instead
 * of each claiming all of it.
 *
 * Deliberately plain: full-batch gradient descent, zero initialisation, a fixed
 * iteration cap and a fixed tolerance. No randomness anywhere, so the same
 * batch fits the same model on any machine — which is what lets the audit trail
 * and the sweep mean anything.
 *
 * It stays interpretable. A coefficient is a contribution to the log-odds,
 * exactly as the Naive Bayes likelihood ratio was, so `exp(coefficient)` slots
 * into the same evidence ladder and reads the same way: "×2.4" is still a
 * feature multiplying the odds by 2.4.
 */

export interface LogisticRow {
  features: readonly string[];
  label: boolean;
}

export interface LogisticFit {
  intercept: number;
  coefficients: Map<string, number>;
  /** Iterations actually run before the tolerance was met. */
  iterations: number;
  converged: boolean;
  /** Mean negative log-likelihood on the rows it was fitted to. */
  log_loss: number;
  l2: number;
}

const sigmoid = (z: number): number => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

export interface LogisticOptions {
  l2?: number;
  iterations?: number;
  learningRate?: number;
  tolerance?: number;
}

export function fitLogistic(rows: readonly LogisticRow[], options: LogisticOptions = {}): LogisticFit {
  const l2 = options.l2 ?? 0.01;
  // AdaGrad's effective step decays as 1/sqrt(accumulated gradient), which is
  // what makes it right for features of wildly different frequency and also
  // what makes it slow to finish. A thousand-record batch was still moving when
  // it hit a cap of 2000 and reported a fit with a 10% calibration error. The
  // cap is the final fit's; the grid probes stay short, because ranking
  // candidates does not need convergence.
  const maxIterations = options.iterations ?? 6000;
  const rate = options.learningRate ?? 0.5;
  const tolerance = options.tolerance ?? 1e-7;

  const coefficients = new Map<string, number>();
  // Sorted, so the fit does not depend on the order a Set happened to iterate.
  for (const name of [...new Set(rows.flatMap((row) => [...row.features]))].sort()) {
    coefficients.set(name, 0);
  }

  const n = Math.max(1, rows.length);
  // Start at the base rate rather than zero: it is the answer when no feature
  // says anything, and beginning there saves a hundred iterations of the
  // intercept walking to it.
  const positives = rows.filter((row) => row.label).length;
  const rate0 = Math.min(Math.max(positives / n, 1e-3), 1 - 1e-3);
  let intercept = Math.log(rate0 / (1 - rate0));

  // AdaGrad, per feature.
  //
  // Plain gradient descent is the wrong optimiser for one-hot features whose
  // frequencies differ by two orders of magnitude: a single learning rate is
  // either too large for `kind=payment`, which appears in most rows, or far too
  // small for `failure×rail=mandate_revoked|nach`, which appears in twenty. The
  // first version used one rate, stopped on a loss delta that a small step
  // satisfies without being anywhere near the optimum, and reported "converged"
  // with its strongest weight at ×1.19 — flat enough that expected value
  // collapsed back onto amount and the model agreed with sorting by size.
  const accumulated = new Map<string, number>();
  for (const feature of coefficients.keys()) accumulated.set(feature, 0);
  let interceptAccumulated = 0;
  const epsilon = 1e-8;

  let previous = Number.POSITIVE_INFINITY;
  let logLoss = previous;
  let iteration = 0;
  let converged = false;

  const gradient = new Map<string, number>();

  for (; iteration < maxIterations; iteration += 1) {
    gradient.clear();
    let interceptGradient = 0;
    logLoss = 0;

    for (const row of rows) {
      let z = intercept;
      for (const feature of row.features) z += coefficients.get(feature) ?? 0;

      const p = sigmoid(z);
      const y = row.label ? 1 : 0;
      const error = p - y;

      interceptGradient += error;
      for (const feature of row.features) {
        gradient.set(feature, (gradient.get(feature) ?? 0) + error);
      }

      // Clamped, because log(0) is how a training loop turns into NaN and
      // reports a model that scores everything at 50.
      const q = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
      logLoss -= y === 1 ? Math.log(q) : Math.log(1 - q);
    }

    logLoss /= n;

    const gi = interceptGradient / n;
    interceptAccumulated += gi * gi;
    intercept -= (rate / (Math.sqrt(interceptAccumulated) + epsilon)) * gi;

    // The intercept is deliberately not penalised. Shrinking it pulls the base
    // rate toward a half, which is a claim about the world, not a preference
    // for simpler models.
    let gradientNorm = gi * gi;
    for (const [feature, value] of coefficients) {
      const g = (gradient.get(feature) ?? 0) / n + l2 * value;
      gradientNorm += g * g;
      const acc = (accumulated.get(feature) ?? 0) + g * g;
      accumulated.set(feature, acc);
      coefficients.set(feature, value - (rate / (Math.sqrt(acc) + epsilon)) * g);
    }

    // Stop on the gradient, not on the loss delta. A tiny step produces a tiny
    // change in loss whether or not the fit is finished, which is how the
    // first version stopped at 301 iterations a long way from the optimum.
    if (Math.sqrt(gradientNorm) < tolerance * 100) {
      converged = true;
      iteration += 1;
      break;
    }
    previous = logLoss;
  }
  void previous;

  return { intercept, coefficients, iterations: iteration, converged, log_loss: logLoss, l2 };
}

/**
 * Picks the regularisation strength, using only the training rows.
 *
 * A grid chosen against the held-out split would be the held-out split
 * informing the model, which is the quiet way to make a report meaningless. The
 * rows are split again — four fifths to fit, one fifth to score — by position,
 * so the choice is reproducible and the test records are still untouched.
 */
export function chooseL2(
  rows: readonly LogisticRow[],
  grid: readonly number[] = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1],
): number {
  if (rows.length < 40) return 0.1; // too little to choose on; prefer more shrinkage

  // Five folds, not one.
  //
  // A single held-in fifth is a few dozen rows, and scoring six candidates on
  // it picks whichever one that particular fifth happened to like — which is
  // how this landed on 0.1, the second-heaviest shrinkage in the grid, and
  // flattened every weight in the model. Folds are taken by position, so the
  // choice is reproducible and the held-out half is still untouched.
  // Four folds, and a short fit in each.
  //
  // These fits exist to *rank* candidates, not to be used — the winner is
  // refitted properly afterwards. Running all of them to full convergence made
  // `revenue detect` take two and a half seconds before it printed anything,
  // which is a model-selection cost charged to the demo's first beat. A few
  // hundred AdaGrad iterations order the grid the same way.
  const folds = 4;
  const probe = { iterations: 250 };
  let best = grid[0] as number;
  let bestLoss = Number.POSITIVE_INFINITY;

  for (const l2 of grid) {
    let loss = 0;
    let counted = 0;

    for (let fold = 0; fold < folds; fold += 1) {
      const fit = fitLogistic(
        rows.filter((_, index) => index % folds !== fold),
        { l2, ...probe },
      );
      for (const row of rows.filter((_, index) => index % folds === fold)) {
        let z = fit.intercept;
        for (const feature of row.features) z += fit.coefficients.get(feature) ?? 0;
        const p = Math.min(Math.max(sigmoid(z), 1e-12), 1 - 1e-12);
        loss -= row.label ? Math.log(p) : Math.log(1 - p);
        counted += 1;
      }
    }

    loss /= Math.max(1, counted);
    if (loss < bestLoss) {
      bestLoss = loss;
      best = l2;
    }
  }
  return best;
}
