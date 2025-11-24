-- Initial schema for MapDang (complete, generated to match src/models)

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Categories
CREATE TABLE category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar UNIQUE NOT NULL
);

-- Instructors
CREATE TABLE instructor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  email varchar
);

-- Rooms
CREATE TABLE room (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar NOT NULL,
  building varchar,
  floor varchar,
  capacity integer DEFAULT 0
);

-- Places
CREATE TABLE place (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar UNIQUE NOT NULL,
  description text,
  photos jsonb,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  "categoryId" uuid REFERENCES category(id) ON DELETE SET NULL
);

-- Users
CREATE TABLE "user" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar UNIQUE NOT NULL,
  "passwordHash" varchar NOT NULL,
  "isAdmin" boolean DEFAULT false
);

-- Courses
CREATE TABLE course (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar NOT NULL,
  title varchar NOT NULL,
  lecturer varchar,
  "instructorId" uuid REFERENCES instructor(id) ON DELETE SET NULL,
  "startAt" timestamptz NOT NULL,
  "endAt" timestamptz NOT NULL,
  "roomId" uuid REFERENCES room(id) ON DELETE SET NULL
);

-- Schedules
CREATE TABLE schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "courseId" uuid REFERENCES course(id) ON DELETE CASCADE,
  "startAt" timestamptz NOT NULL,
  "endAt" timestamptz NOT NULL,
  recurrence text
);

-- Devices
CREATE TABLE device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deviceId" varchar UNIQUE NOT NULL,
  name varchar,
  "lastSeen" timestamptz
);

-- Sessions
CREATE TABLE session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deviceId" uuid REFERENCES device(id) ON DELETE CASCADE,
  "startedAt" timestamptz NOT NULL,
  "endedAt" timestamptz,
  metadata text
);

-- Positions (locations)
CREATE TABLE position (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deviceId" uuid REFERENCES device(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  heading double precision,
  "createdAt" timestamptz DEFAULT now()
);

-- Graph edges
CREATE TABLE edge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fromId" varchar NOT NULL,
  "toId" varchar NOT NULL,
  cost double precision DEFAULT 1,
  meta jsonb
);

-- Signalements (reports)
CREATE TABLE signalement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "placeId" uuid REFERENCES place(id) ON DELETE SET NULL,
  message text,
  photos jsonb,
  status varchar DEFAULT 'pending',
  "createdAt" timestamptz DEFAULT now()
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_place_category ON place("categoryId");
CREATE INDEX IF NOT EXISTS idx_course_room ON course("roomId");
CREATE INDEX IF NOT EXISTS idx_course_instructor ON course("instructorId");
CREATE INDEX IF NOT EXISTS idx_session_device ON session("deviceId");
CREATE INDEX IF NOT EXISTS idx_position_device ON position("deviceId");
