# Reserved WordPress block module

This directory reserves the separate Gutenberg integration entry point from PLAN.md. The functional block is M4.11 work; M1 does not register an incomplete block. Future block code must use WordPress' block APIs and the existing public rendering boundary. It must not import Vue/Quasar editor code or bundle the frontend runtime into the editor. The current shortcode remains the working integration.
