
import {PromptMessage, TerminalImplementation, AutocompleteCallbackType, ExecCallbackType} from './terminal_implementation';
import {RTextFormatter} from './text_formatter';
import {LanguageInterface, RInterface, JuliaInterface} from './language_interface';
import {TabPanel, TabJustify, TabEventType} from './tab_panel';

import {remote} from 'electron';

const {Menu, MenuItem} = remote;

import * as Rx from "rxjs";

interface TerminalInstance {
  child:HTMLElement;
  terminal:TerminalImplementation;
  layout?:number;
}

export class MuliplexedTerminal {

  private terminal_instances_:{[index:string]:TerminalInstance} = {};
  private active_instance_:TerminalInstance;

  private tabs_:TabPanel;
  private node_:HTMLElement;

  private layout_ = -1;

  constructor(node:string|HTMLElement, tab_node_selector:string){

    if( typeof node === "string" ){
      this.node_ = document.querySelector(node);
    }
    else {
      this.node_ = node;
    }

    this.tabs_ = new TabPanel(tab_node_selector, TabJustify.left);

    this.tabs_.events.subscribe(event => {

      let label = event.tab.label;
      let terminal_instance = this.terminal_instances_[label];

      // console.info("tab event", event, event.tab.label);

      switch(event.type){
      case "activate":
        terminal_instance.child.style.display = "block";
        this.active_instance_ = terminal_instance;
        if( terminal_instance.layout !== this.layout_ ) {

          // console.info( " * tab", label, "needs layout update");
          terminal_instance.terminal.Resize();
          terminal_instance.layout = this.layout_;
        }
        break;
      case "deactivate":
        terminal_instance.child.style.display = "none";
        if( this.active_instance_ === terminal_instance ) this.active_instance_ = null;
        break;
      default:
        console.info( "unexpected tab event", event);
      }
    });

  }

  /**
   * updates terminal layout for the active terminal, and updates the 
   * internal index. if a new tab is activated and the indexes are different,
   * we assume that the new tab needs a layout refresh.
   */
  UpdateLayout(){

    // increment layout index
    this.layout_++;
    if(!this.active_instance_) return;
    
    this.active_instance_.terminal.Resize();
    this.active_instance_.layout = this.layout_;
  }

  /**
   * adds a busy overlay (spinning gear). these are tab/terminal specific,
   * because they represent "local" busy and not global busy. timeout is 
   * used to prevent stutter on very short calls (like autocomplete).
   */
  CreateBusyOverlay(subject:Rx.Subject<boolean>, node:HTMLElement, className:string, delay = 250){

    let timeout_id = 0; // captured

    subject.subscribe(state => {
      if(state){
        if(timeout_id) return;
        timeout_id = window.setTimeout(() => {
          node.classList.add(className);
        }, delay);
      }
      else {
        if(timeout_id) window.clearTimeout(timeout_id);
        timeout_id = 0;
        node.classList.remove(className);
      }
    });

  }

  /**
   * add a terminal for the given language. this method handles creating 
   * a child node, assigning a tab, creating the terminal instance and 
   * attaching the language. 
   * 
   * FIXME: we should share context menu/event handler.
   * FIXME: context menu should be parameterized (per-language)
   */
  Add(language_interface:LanguageInterface){

    let child = document.createElement("div");
    child.classList.add("terminal-child");
    this.tabs_.AppendChildNode(child);

    let label = language_interface.label_;
    let terminal = new TerminalImplementation(language_interface, child);
    terminal.Init();

    child.addEventListener("contextmenu", e => {
      Menu.buildFromTemplate([
        { label: "Copy", click: () => { terminal.Copy(); }},
        { label: "Paste", click: () => { terminal.Paste(); }},
        { type: "separator" },
        { label: "Clear Shell", click: () => { terminal.ClearShell(); }}
      ]).popup();
    });
    
    this.CreateBusyOverlay(language_interface.pipe_.busy_status, child, "busy");

    this.terminal_instances_[label] = {child, terminal};

    // NOTE: we call AddTab **after** creating the local instance, because 
    // we'll get an activation event and we want it to be in the list.

    this.tabs_.AddTab({label});

  }

}