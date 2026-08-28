from harvest.enrich.email_extract import extract_emails, is_link_in_bio


def test_plain_email():
    assert extract_emails("collab: Mai.Work@Gmail.com 💌") == ["mai.work@gmail.com"]


def test_obfuscated_at_dot():
    assert extract_emails("linh(at)glowmail(dot)com") == ["linh@glowmail.com"]
    assert extract_emails("jay [at] dino [dot] studio") == ["jay@dino.studio"]


def test_mixed_and_dedup():
    bio = "mgmt@example.com / backup: mgmt(at)example(dot)com"
    assert extract_emails(bio) == ["mgmt@example.com"]


def test_no_email():
    assert extract_emails("just vibes ✨") == []
    assert extract_emails(None) == []
    assert extract_emails("") == []


def test_trailing_dot_stripped():
    assert extract_emails("mail me: a@b.co.") == ["a@b.co"]


def test_link_in_bio_hosts():
    assert is_link_in_bio("https://linktr.ee/sunlover")
    assert is_link_in_bio("beacons.ai/mai")
    assert not is_link_in_bio("https://example.com/about")
