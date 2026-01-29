#!/bin/bash

# reset_dev_db.sh
# Utility to completely reset the Development Database and Seed it with Test Accounts

# Ensure we are in the project root (where docker-compose.yml is)
# Assuming script is run from project root or scripts folder
if [ -f "docker-compose.yml" ]; then
    PROJECT_ROOT="."
elif [ -f "../docker-compose.yml" ]; then
    PROJECT_ROOT=".."
else
    echo "❌ Error: Could not locate docker-compose.yml. Please run this script from the project root."
    exit 1
fi

echo "⚠️  WARNING: This will DESTRUCTIVELY RESET the database."
echo "   All data will be lost and replaced with seed data."
echo "   Environment: Development (Docker)"
echo ""
read -p "Are you sure you want to proceed? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Operation cancelled."
    exit 1
fi

echo ""
echo "🚀 Starting Database Reset..."
echo "--------------------------------"

# 1. Reset Database Schema (Destructive)
echo "1️⃣  Running: prisma migrate reset --force"
docker compose -f "$PROJECT_ROOT/docker-compose.yml" -f "$PROJECT_ROOT/docker-compose.dev.yml" exec -w /app/backend backend npx prisma migrate reset --force

if [ $? -ne 0 ]; then
    echo "❌ Database reset failed."
    exit 1
fi

# 2. Seed Database
echo ""
echo "2️⃣  Running: npm run seed"
docker compose -f "$PROJECT_ROOT/docker-compose.yml" -f "$PROJECT_ROOT/docker-compose.dev.yml" exec -w /app/backend backend npm run seed

if [ $? -ne 0 ]; then
    echo "❌ Database seeding failed."
    exit 1
fi

echo ""
echo "✅ SUCCESS! Database has been reset and seeded."
echo "   You can now log in with the 'Test' buttons in the frontend."
