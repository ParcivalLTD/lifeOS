ALTER TABLE "metric_datapoints" ALTER COLUMN "source" SET DEFAULT 'native';--> statement-breakpoint
ALTER TABLE "metric_datapoints" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_datapoints_source_external_uq" ON "metric_datapoints" USING btree ("user_id","source","external_id") WHERE "metric_datapoints"."external_id" IS NOT NULL;