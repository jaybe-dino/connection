from harvest.config import ConvergenceParams
from harvest.discover import ConvergenceDetector, DailyBudget, SEED_DICT


def _run_batch(det: ConvergenceDetector, new: int, seen: int) -> bool:
    for _ in range(new):
        det.observe(True)
    for _ in range(seen):
        det.observe(False)
    return det.end_batch()


def test_no_convergence_while_new_accounts_flow():
    det = ConvergenceDetector(ConvergenceParams(window_size=1000))
    assert not _run_batch(det, new=300, seen=700)  # 30% 신규
    assert not det.converged


def test_converges_after_three_low_batches():
    det = ConvergenceDetector(ConvergenceParams(window_size=1000))
    _run_batch(det, new=10, seen=990)   # 1%
    assert not det.converged
    _run_batch(det, new=5, seen=995)
    assert not det.converged
    assert _run_batch(det, new=5, seen=995)  # 3연속 → 수렴
    assert det.converged


def test_streak_resets_on_spike():
    det = ConvergenceDetector(ConvergenceParams(window_size=100))
    _run_batch(det, new=1, seen=99)
    _run_batch(det, new=1, seen=99)
    _run_batch(det, new=50, seen=50)    # 급증 → streak 리셋
    _run_batch(det, new=1, seen=99)
    _run_batch(det, new=0, seen=100)
    assert not det.converged            # 리셋 후 2연속뿐


def test_daily_budget_carryover():
    b = DailyBudget(limit=100)
    assert b.try_spend(60)
    assert b.try_spend(40)
    assert not b.try_spend(1)           # 소진 → 이월
    assert b.carryover == 1
    b.rollover()
    assert b.try_spend(1)


def test_seed_dict_shape():
    vn = SEED_DICT["VN"]["sunscreen"]
    assert vn.hashtags and vn.shop_category_id == "601450"
