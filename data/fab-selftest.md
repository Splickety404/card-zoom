## Picture index: fab

16657 artworks, 1.2 MB. Chosen colour weight 1.5, max distance 40.8.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 798 | 56.9% | 62.3% | 64.4% | 64.8% | 65.0% | 64.3% | 34.0 / 43.9 | 0.0 |
| 48 | 798 | 61.7% | 64.8% | 65.3% | 65.4% | 65.2% | 65.0% | 32.1 / 40.7 | 0.0 |
| 72 | 798 | 61.7% | 64.3% | 64.9% | 65.3% | 65.0% | 64.7% | 31.3 / 40.8 | 0.0 |
| 120 | 798 | 64.3% | 64.8% | 65.2% | 65.4% | 65.3% | 65.3% | 26.6 / 35.2 | 0.1 |

Non-card crops, best distance (chosen w): p05 47.3, p50 55.9, p90 64.7

### Learned embedding

Top-1 by card height: 32px 57.3%, 48px 61.3%, 72px 62.5%, 120px 64.2%.
Correct matches' similarity p05 0.715, p50 0.839; lead p10 0.002. Non-cards' best similarity p50 0.449, p99 0.63.
Accepted (similarity ≥ 0.63, lead ≥ 0.02) and correct: 32px 44.1%, 48px 61.0%, 72px 62.5%, 120px 64.2%

Share of cards identified correctly *and* under the cut-off: 32px 55.0%, 48px 62.2%, 72px 62.2%, 120px 65.2%
