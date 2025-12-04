# Stage 1: Build the application
FROM python:3.11 AS build

WORKDIR /usr/src/app

# System build tools (needed for some Python packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Use a virtual environment for dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies if present
COPY requirements.tx[t] ./requirements.txt
RUN pip install --upgrade pip && \
    if [ -f requirements.txt ]; then pip install -r requirements.txt; fi

# Copy the rest of the code
COPY . .

# Stage 2: Runtime image
FROM python:3.11

WORKDIR /usr/src/app

# Bring in the virtual environment and source code
COPY --from=build /opt/venv /opt/venv
COPY --from=build /usr/src/app .

ENV PATH="/opt/venv/bin:$PATH"

# Non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /usr/src/app
USER appuser

# Configure port
ENV PORT=8080
EXPOSE 8080

# Start the application
CMD ["python", "app.py"]
