.PHONY: help install install-dev run dev lint lint-fix format format-check check clean \
	migrate-upgrade migrate-downgrade migrate-create migrate-current migrate-history \
	migrate-romiot-upgrade migrate-romiot-downgrade migrate-romiot-create \
	migrate-romiot-current migrate-romiot-history

# Variables
PYTHON := python3
VENV := venv
BIN := $(VENV)/bin

# Check if venv exists, otherwise use system binaries
ifeq ($(wildcard $(BIN)/python),)
	PYTHON_CMD := $(PYTHON)
	PIP_CMD := pip3
	RUFF_CMD := ruff
	UVICORN_MODULE := uvicorn
else
	PYTHON_CMD := $(BIN)/python
	PIP_CMD := $(BIN)/pip
	RUFF_CMD := $(BIN)/ruff
	UVICORN_MODULE := uvicorn
endif

# Default target
help:
	@echo "Available commands:"
	@echo ""
	@echo "  Setup & Installation:"
	@echo "    make install          - Install project dependencies"
	@echo "    make install-dev      - Install dependencies including dev tools"
	@echo ""
	@echo "  Development:"
	@echo "    make run              - Run the FastAPI server"
	@echo "    make dev              - Run the server with auto-reload"
	@echo ""
	@echo "  Code Quality (Ruff):"
	@echo "    make lint             - Check code with Ruff"
	@echo "    make lint-fix         - Auto-fix linting issues"
	@echo "    make format           - Format code with Ruff"
	@echo "    make format-check     - Check code formatting (no changes)"
	@echo "    make check            - Run both lint and format checks (no changes)"
	@echo ""
	@echo "  Database Migrations:"
	@echo "    make migrate-upgrade  - Upgrade primary database to head"
	@echo "    make migrate-downgrade - Downgrade primary database by 1"
	@echo "    make migrate-create MSG='message' - Create new migration for primary DB"
	@echo "    make migrate-current  - Show current migration revision for primary DB"
	@echo "    make migrate-history  - Show migration history for primary DB"
	@echo ""
	@echo "  RomIOT Database Migrations:"
	@echo "    make migrate-romiot-upgrade   - Upgrade romiot database to head"
	@echo "    make migrate-romiot-downgrade - Downgrade romiot database by 1"
	@echo "    make migrate-romiot-create MSG='message' - Create new migration for romiot DB"
	@echo "    make migrate-romiot-current   - Show current migration revision for romiot DB"
	@echo "    make migrate-romiot-history   - Show migration history for romiot DB"
	@echo ""
	@echo "  Utilities:"
	@echo "    make clean            - Remove cache files and __pycache__ directories"

# Installation
install:
	$(PIP_CMD) install -r requirements.txt

install-dev: install
	@echo "Development dependencies installed"

# Run server
run:
	$(PYTHON_CMD) -m $(UVICORN_MODULE) main:app --host 0.0.0.0 --port 8000

dev:
	$(PYTHON_CMD) -m $(UVICORN_MODULE) main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app

# Ruff commands
lint:
	@echo "🔍 Running Ruff linter..."
	$(RUFF_CMD) check .

lint-fix:
	@echo "🔧 Auto-fixing linting issues..."
	$(RUFF_CMD) check --fix .

format:
	@echo "✨ Formatting code with Ruff..."
	$(RUFF_CMD) format .

format-check:
	@echo "🔍 Checking code formatting..."
	$(RUFF_CMD) format --check .

check: lint format-check
	@echo "✅ All checks passed!"

# Database migrations - Primary database
migrate-upgrade:
	@echo "🚀 Upgrading primary database..."
	$(PYTHON_CMD) manage_migrations.py primary upgrade head

migrate-downgrade:
	@echo "⏪ Downgrading primary database..."
	$(PYTHON_CMD) manage_migrations.py primary downgrade -1

migrate-create:
	@if [ -z "$(MSG)" ]; then \
		echo "❌ Please provide a migration message: make migrate-create MSG='your message'"; \
		exit 1; \
	fi
	@echo "📝 Creating migration for primary database..."
	$(PYTHON_CMD) manage_migrations.py primary create "$(MSG)"

migrate-current:
	@echo "📊 Current migration revision for primary database:"
	$(PYTHON_CMD) manage_migrations.py primary current

migrate-history:
	@echo "📜 Migration history for primary database:"
	$(PYTHON_CMD) manage_migrations.py primary history

# Database migrations - RomIOT database
migrate-romiot-upgrade:
	@echo "🚀 Upgrading romiot database..."
	$(PYTHON_CMD) manage_migrations.py romiot upgrade head

migrate-romiot-downgrade:
	@echo "⏪ Downgrading romiot database..."
	$(PYTHON_CMD) manage_migrations.py romiot downgrade -1

migrate-romiot-create:
	@if [ -z "$(MSG)" ]; then \
		echo "❌ Please provide a migration message: make migrate-romiot-create MSG='your message'"; \
		exit 1; \
	fi
	@echo "📝 Creating migration for romiot database..."
	$(PYTHON_CMD) manage_migrations.py romiot create "$(MSG)"

migrate-romiot-current:
	@echo "📊 Current migration revision for romiot database:"
	$(PYTHON_CMD) manage_migrations.py romiot current

migrate-romiot-history:
	@echo "📜 Migration history for romiot database:"
	$(PYTHON_CMD) manage_migrations.py romiot history

# Cleanup
clean:
	@echo "🧹 Cleaning up cache files..."
	find . -type d -name "__pycache__" -exec rm -r {} + 2>/dev/null || true
	find . -type d -name "*.pyc" -exec rm -r {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache" -exec rm -r {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@echo "✅ Cleanup complete!"
