<?php
/* Server settings for the feedback endpoint. Edit before going live on the County server. */
const FEEDBACK_EMAIL = 'feedback@garissa.go.ke';
const FROM_EMAIL     = 'feedback@garissa.go.ke';
const FROM_NAME      = 'County Government of Garissa';
const RESPONSE_DAYS  = 7;
/* Keep the database outside the public web folder. */
const DB_PATH        = __DIR__ . '/../../private/garissa_feedback.sqlite';
/* Long random string that protects the feedback report. Change it. */
const REPORT_KEY     = 'CHANGE-THIS-KEY-BEFORE-GO-LIVE';
