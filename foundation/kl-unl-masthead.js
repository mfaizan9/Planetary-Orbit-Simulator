class KLUNLMasthead extends HTMLElement {
  constructor() {
    super();
    // Attach a Shadow DOM to isolate styles and structure from the main page
    this.attachShadow({ mode: 'open' });

    // Internal State Tracking
    this.hasReadHelp          = false;
    this.simData              = null;
    this.activeTriggerButton  = null;
  }

  // Define which attributes to watch for changes
  static get observedAttributes() {
    return ['sim-id', 'json-url'];
  }

  async connectedCallback() {
    const simId   = this.getAttribute('sim-id');
    const jsonUrl = this.getAttribute('json-url') || '../foundation/contents.json';

    if (!simId) {
      console.error('kl-unl-masthead: "sim-id" attribute is required.');
      return;
    }

    try {
      const response  = await fetch(jsonUrl);
      const data      = await response.json();
      this.simData    = data[simId];

      if (!this.simData) {
        console.error(`kl-unl-masthead: Simulation ID "${simId}" not found in JSON.`);
        return;
      }

      this.render();
      this.setupEventListeners();
    } catch (error) {
      console.error('kl-unl-masthead: Failed to load sim-specific data.', error);
    }
  }

  render() {
    const mastheadData   = this.simData.masthead;
    const metaData       = this.simData.meta;

    // Check if help content exists and isn't empty
    const hasHelpContent = ( mastheadData.help && mastheadData.help.content.trim() !== "" );

    this.shadowRoot.innerHTML = `
      <link href="foundation/kl-unl.css" type="text/css" rel="stylesheet" media="all">
      <style>
        :host {
          display:             block;
          font-family:         system-ui, -apple-system, sans-serif;
          box-sizing:          border-box;
        }
        .masthead-container {
          display:             flex;
          justify-content:     space-between;
          align-items:         center;
          background-color:    var(--background-color,          #ffffff);
          color:               var(--foreground-color,          #1a1a1a);
          padding:             10px 20px;
          border-bottom-width: var(--border-bottom-width,       3px);
          border-bottom-style: var(--border-bottom-style,       solid);
          border-bottom-color: var(--border-bottom-color,       #005a9c);
        }
        h1 {
          margin:              0;
          font-size:           1.25rem;
        }
        .controls-group {
          display:             flex;
          gap:                 10px;
        }
        button {
          color:               var(--button-foreground-color,   #ffffff);
          background-color:    var(--button-background-color,   #005a9c);
          border-width:        var(--border-width,              1px);
          border-style:        var(--border-style,              solid);
          border-color:        var(--border-color,              #767676);
          padding:             6px 12px;
          border-radius:       4px;
          cursor:              pointer;
          font-weight:         600;
          font-size:           0.9rem;
          transition:          filter 0.1s ease; /* Smooth hover transition */
        }
        button:hover, button:focus {
          filter:              brightness( var(--button-hover-darken, 0.9) );
          outline-width:       var(--button-outline-width,      2px);
          outline-style:       var(--button-outline-style,      solid);
          outline-color:       var(--button-outline-color,      #ffbc00);
          outline-offset:      2px;
        }
        /* Compliant light neon green for initial prompt */
        .initial-prompt {
          color:               var(--alert-color-g,             #b3f681);
          border-color:        var(--alert-color-g,             #b3f681);
        }

        /* Modal Dialog Styling */
        /* (for overlay showing help or background information) */
        dialog {
          padding:             24px;
          border-width:        var(--border-width,              1px);
          border-style:        var(--border-style,              solid);
          border-color:        var(--border-color,              #767676);
          border-radius:       8px;
          max-width:           600px;
          width:               80vw;
          max-height:          80vh;
          overflow-y:          auto;
          box-shadow:          0 4px 20px rgba(0,0,0,0.2);
          background-color:    var(--background-color,          #ffffff);
          color:               var(--foreground-color,          #1a1a1a);
        }
        dialog::backdrop {
          background-color:    rgba(0, 0, 0, 0.6);
          backdrop-filter:     blur(2px);
        }
        .dialog-footer {
          margin-top:          20px;
          display:             flex;
          justify-content:     flex-end;
        }
        .close-btn {
          color:               var(--background-color,          #ffffff);
          background-color:    var(--button-background-color,   #005a9c);
          border:              none;
        }
      </style>

      <div class="masthead-container">
        <h1 id="sim-title">${metaData.title}</h1>
        <nav class="controls-group" aria-label="Simulation Controls">
          <button id="resetBtn-mh">Reset</button>
          ${hasHelpContent ? `<button id="helpBtn-mh" class="initial-prompt">Review Help Guide</button>` : ''}
          <button id="aboutBtn-mh">About</button>
        </nav>
      </div>

      <dialog id="infoDialog-mh" role="alertdialog" aria-labelledby="dialogTitle-mh">
        <h2 id="dialogTitle-mh" style="margin-top: 0;"></h2>
        <div aria-hidden="true">
          <div id="dialogBody-mh"></div>
        </div>
        <p id="sr-description-mh" class="sr-only"></p>
        <div class="dialog-footer">
          <button id="closeDialogBtn-mh" class="close-btn" aria-describedby="sr-description-mh">Close</button>
        </div>
      </dialog>
    `;
  }

  setupEventListeners() {
    const shadow   = this.shadowRoot;
    const dialog   = shadow.getElementById('infoDialog-mh');
    const helpBtn  = shadow.getElementById('helpBtn-mh');
    const aboutBtn = shadow.getElementById('aboutBtn-mh');
    const resetBtn = shadow.getElementById('resetBtn-mh');
    const closeBtn = shadow.getElementById('closeDialogBtn-mh');

    if (helpBtn) {
      helpBtn.addEventListener('click', () => this.openModal('help', helpBtn));
    }
    aboutBtn.addEventListener('click', () => this.openModal('about', aboutBtn));

    // Bubble the Reset event up so the individual simulation file can listen for it
    resetBtn.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('sim-reset', { bubbles: true, composed: true }));
    });

    closeBtn.addEventListener('click', () => this.closeModal());

    // Native dialog cancel hook (triggers via 'Escape' key)
    dialog.addEventListener('cancel', () => this.handleFocusRestoration());
  }

  openModal(type, triggerBtn) {
    this.activeTriggerButton = triggerBtn;
    const dialog             = this.shadowRoot.getElementById('infoDialog-mh');
    const title              = this.shadowRoot.getElementById('dialogTitle-mh');
    const body               = this.shadowRoot.getElementById('dialogBody-mh');
    const srDesc             = this.shadowRoot.getElementById('sr-description-mh');
    const targetData         = this.simData.masthead[type];

    title.textContent        = targetData.title;
    body.innerHTML           = targetData.content;

    // Convert rich HTML content to a clean, flat string block for VoiceOver
    const tempDiv            = document.createElement('div');
    tempDiv.innerHTML        = targetData.content;
    const flatText           = tempDiv.textContent || tempDiv.innerText || "";

    // Set description text for the Close button
    //
    // Note that VoiceOver will say "close" first and then read the button
    // description. Getting to this point was fairly difficult, so we may have
    // to live with this order as it is fundamental to the accessibility model.
    // (First label element and then read descriptive text.)
    //
    srDesc.textContent       = flatText;

    // Handle Help button state modifications on initial click
    if (type === 'help' && !this.hasReadHelp) {
      this.hasReadHelp       = true;
      triggerBtn.textContent = "Help";
      triggerBtn.classList.remove('initial-prompt');
    }

    dialog.showModal();

    // Add small delay to allow VoiceOver to finish processing modal opening event
    setTimeout(() => {
      this.shadowRoot.getElementById('closeDialogBtn-mh').focus();
    }, 50);

  }

  closeModal() {
    this.shadowRoot.getElementById('infoDialog-mh').close();

    // Clear description so it's ready for next time a masthead button is clicked
    this.shadowRoot.getElementById('sr-description-mh').textContent = "";

    this.handleFocusRestoration();
  }

  handleFocusRestoration() {
    if (this.activeTriggerButton) {
      this.activeTriggerButton.focus();
    }
  }
}

// Define the custom element name to explicitly honor project founder
customElements.define('kl-unl-masthead', KLUNLMasthead);
