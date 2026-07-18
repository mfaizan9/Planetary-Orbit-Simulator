// MathJax Integration for Equation Display (includes Screen Reader Support)
// KL-UNL
// Nicole P. Vogt
// 2026-06-06

//////////////////////////////////////////////////////////////////////////////
// Update LaTeX-driven equation, and related screen reader elements
//////////////////////////////////////////////////////////////////////////////

function klunlInitEqn()  {

  // Redefine klunlInitEqn function in sim-specific sim.js file to initialize
  // equation when page loads, and (optionally) any other sim-driven components.
  // This version of the function will then be automatically superseded.

  klunlShowEquation();

};


function klunlShowEquation( eqn, msg1, msg2 )  {

  // Update contents of LaTeX-driven equation and up to two screen reader elements
  //
  // First input is an array containing the equation container element and
  // its LaTeX string content.
  //
  // Second (optional) input is an array containing a screen reader element
  // and its message content. The message is designed to be read aloud
  // when the equation is updated. This might be a description of the
  // equation, its variables, and a value.
  //
  // Third (optional) input is an array containing a screen reader element
  // and its message content. The message is designed to be read aloud
  // when the equation is updated. This might be a description of a
  // figure which changes as the equation is updated.

  // Show LaTeX-format equation on screen (or update its contents)
  if ( ( Array.isArray( eqn ) ) && ( eqn.length >= 2 ) )  {

    const eqnElement = document.getElementById(eqn[0]);

    if ( eqnElement )  {

      eqnElement.innerHTML = eqn[1];

      // Fire the asynchronous compilation task through MathJax
      if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([eqnElement]).catch((err) => console.error(err));
      }
    }
  }

  // Update first screen reader message if present
  if ( ( Array.isArray( msg1 ) ) && ( msg1.length >= 2 ) )  {

    const msgElement = document.getElementById(msg1[0]);

    if ( msgElement )  { msgElement.textContent = msg1[1]; }
  }

  // Update second screen reader message if present
  if ( ( Array.isArray( msg2 ) ) && ( msg2.length >= 2 ) )  {

    msgElement = document.getElementById(msg2[0]);

    if ( msgElement )  { msgElement.textContent = msg2[1]; }
  }

  // Check inputs for validity to define success
  // (note any excess inputs are ignored)
  if      ( ( arguments.length == 1 ) &&
            ( Array.isArray( eqn  ) ) && ( eqn.length  >= 2 ) )  { return 1; }
  else if ( ( arguments.length == 2 ) &&
            ( Array.isArray( eqn  ) ) && ( eqn.length  >= 2 ) &&
            ( Array.isArray( msg1 ) ) && ( msg1.length >= 2 ) )  { return 2; }
  else if ( ( arguments.length >= 3 ) &&
            ( Array.isArray( eqn  ) ) && ( eqn.length  >= 2 ) &&
            ( Array.isArray( msg1 ) ) && ( msg1.length >= 2 ) &&
            ( Array.isArray( msg2 ) ) && ( msg2.length >= 2 ) )  { return 3; }
  else                                                           { return 0; }

};
