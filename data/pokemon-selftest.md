## Picture index: pokemon

20583 artworks, 1.5 MB. Chosen colour weight 3, max distance 59.3.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 797 | 90.1% | 96.7% | 99.4% | 99.5% | 99.5% | 99.5% | 50.4 / 68.5 | 15.1 |
| 48 | 797 | 94.6% | 98.5% | 99.6% | 99.6% | 99.6% | 99.7% | 48.1 / 65.4 | 19.7 |
| 72 | 797 | 95.2% | 99.0% | 99.9% | 99.9% | 99.9% | 99.9% | 45.4 / 62.2 | 22.0 |
| 120 | 797 | 99.5% | 99.9% | 99.9% | 99.9% | 99.9% | 100.0% | 40.8 / 57.6 | 26.1 |

Non-card crops, best distance (chosen w): p05 59.3, p50 90.9, p90 103.7

### Learned embedding

Top-1 by card height: 32px 92.5%, 48px 99.1%, 72px 99.9%, 120px 99.9%.
Correct matches' similarity p05 0.73, p50 0.849; lead p10 0.102. Non-cards' best similarity p50 0.496, p99 0.656.
Accepted (similarity ≥ 0.656, lead ≥ 0.02) and correct: 32px 71.3%, 48px 98.0%, 72px 99.5%, 120px 99.9%

Share of cards identified correctly *and* under the cut-off: 32px 81.4%, 48px 87.1%, 72px 91.7%, 120px 96.5%
