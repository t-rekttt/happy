# Coder workspace image with the t-rekttt/happy fork CLI baked in.
#
# FROM the same base the Coder template uses, so it's a drop-in: only the
# `happy` command is added (built once here, not on every workspace start).
# Build context = repo root; ./happy-cli-out is produced by
# scripts/build-happy-cli-deploy.sh (self-contained, arch-specific).
FROM codercom/example-universal:ubuntu

# Self-contained CLI: dist + bin + bundled @slopus/happy-wire and native deps.
COPY happy-cli-out /opt/happy

# Symlink onto a PATH dir that every shell sees (avoids nvm/npm-global PATH
# quirks). Node comes from the base image at runtime.
USER root
RUN chmod +x /opt/happy/bin/*.mjs \
 && ln -sf /opt/happy/bin/happy.mjs /usr/local/bin/happy \
 && ln -sf /opt/happy/bin/happy-mcp.mjs /usr/local/bin/happy-mcp \
 && happy --version || true
USER coder
