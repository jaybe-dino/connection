\set ON_ERROR_STOP on
-- Run against a disposable, empty local PostgreSQL database.
CREATE TABLE brands (brand_id text PRIMARY KEY, is_demo boolean NOT NULL DEFAULT false, plan text DEFAULT 'growth');
CREATE TABLE creators (creator_id text PRIMARY KEY, verified boolean NOT NULL DEFAULT false);
CREATE TABLE memberships (creator_id text REFERENCES creators, brand_id text REFERENCES brands, joined_at timestamptz DEFAULT now(), PRIMARY KEY(creator_id,brand_id));
CREATE TABLE brand_applications (plan text DEFAULT 'growth', status text DEFAULT 'pending');
INSERT INTO brands VALUES ('real',false,'growth'),('other',false,'starter'),('demo',true,'growth');
INSERT INTO creators VALUES ('verified',true),('later',false),('history',false);
INSERT INTO memberships VALUES ('history','real','2020-01-01');
\ir ../../../../db/migrations/010_signup_billing.sql
INSERT INTO memberships VALUES ('verified','real',clock_timestamp());
INSERT INTO memberships VALUES ('verified','real',clock_timestamp()) ON CONFLICT DO NOTHING;
INSERT INTO memberships VALUES ('verified','other',clock_timestamp());
INSERT INTO memberships VALUES ('verified','demo',clock_timestamp());
INSERT INTO memberships VALUES ('later','real',clock_timestamp());
DO $$ BEGIN
 IF (SELECT count(*) FROM signup_usage) <> 2 THEN RAISE EXCEPTION 'Only two verified non-demo brand joins should be recorded'; END IF;
END $$;
UPDATE creators SET verified=true WHERE creator_id IN ('later','history');
UPDATE creators SET verified=false WHERE creator_id='later';
UPDATE creators SET verified=true WHERE creator_id='later';
DELETE FROM memberships WHERE creator_id='verified' AND brand_id='real';
INSERT INTO memberships VALUES ('verified','real',clock_timestamp());
DO $$ BEGIN
 IF (SELECT count(*) FROM signup_usage) <> 3 THEN RAISE EXCEPTION 'Rejoin/reverification must not duplicate, history must not backbill'; END IF;
 IF (SELECT sum(unit_price) FROM signup_usage) <> 15000 THEN RAISE EXCEPTION 'Three joins must total 15000'; END IF;
 IF EXISTS (SELECT 1 FROM signup_usage WHERE brand_id='demo' OR creator_id='history') THEN RAISE EXCEPTION 'Historical/demo charge'; END IF;
END $$;
