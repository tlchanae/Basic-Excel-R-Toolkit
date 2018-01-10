
import * as Rx from 'rxjs';

export interface TabSpec {

  /** tab label */
  label:string;

  /** tooltip. html title, ideally something better */
  tooltip?:string;

  /** should only be set by tab panel */
  active?:boolean;

  /** can be closed with a click (shows X) */
  closeable?:boolean;

  /** dirty: shows icon */
  dirty?:boolean;

  /** show a button. needed for close/dirty */
  button?:boolean;

  /** show an icon */
  icon?:boolean;

  /** icon class (opaque, attached to the icon node) */
  icon_class?:string;

  /** arbitrary tab data */
  data?:any;

}

export enum TabClasses {
  active = "active", 
  dirty = "dirty", 
  closeable = "closeable" 
}

export enum TabJustify {
  left = "left",
  right = "right"
}

export enum TabEventType {
  activate = "activate",
  deactivate = "deactivate",
  rightClick = "right-click",
  buttonClick = "button-click"
}

export interface TabEvent {
  type:TabEventType;
  tab:TabSpec; 
}

interface DecoratedElement extends HTMLElement {
  ref_?:TabSpec;
}

/**
 * preliminary implementation of generic tab panel. the aim is to abstract
 * tabs from implementation, and then use subscribers/observers to handle 
 * events.
 */
export class TabPanel {

  parent_:HTMLElement;
  tab_container_:HTMLElement;
  tab_content_:HTMLElement;

  /** list of tabs */
  private tabs_:TabSpec[] = [];

  private active_index_ = -1;

  /** observable for tab events */
  private events_:Rx.Subject<TabEvent> = new Rx.Subject<TabEvent>();

  /** accessor */
  public get events() { return this.events_; }

  /** accessor: returns tab or null */
  get active() { 
    if( this.active_index_ < 0 || this.active_index_ >= this.tabs_.length ) return null;
    return this.tabs_[this.active_index_];
  }

  constructor(parent:HTMLElement|string, justify:TabJustify = TabJustify.left){
    
    if(typeof parent === "string") this.parent_ = document.querySelector(parent);
    else this.parent_ = parent;
    this.parent_.classList.add( "tab-panel-container");

    let children = this.parent_.children;

    // create the tab bar

    this.tab_container_ = document.createElement("div");
    this.tab_container_.classList.add( "tab-panel-tabs" );
    if( justify === TabJustify.right ) this.tab_container_.classList.add('tab-panel-justify-right');

    this.parent_.appendChild(this.tab_container_);

    // move children to the content panel (and create the content panel)

    this.tab_content_ = document.createElement("div");
    this.tab_content_.classList.add( "tab-panel-content" );
    
    Array.prototype.forEach.call(children, child => {
      this.tab_content_.appendChild(child);
    });

    this.parent_.appendChild(this.tab_content_);

    this.tab_container_.addEventListener("mousedown", event => {

      // only left/right
      if( event.buttons !== 1 && event.button !== 2 ) return;

      event.stopPropagation();
      event.preventDefault();

      let target = event.target as HTMLElement;
 
      let button_click = (target && target.classList && target.classList.contains("tab-panel-tab-button"));

      while( target && target.classList && !target.classList.contains("tab-panel-tab")){
        if(target.classList.contains("tab-panel-tabs")) return;
        target = target.parentElement;
      }

      if(target) {
        let tab = (target as DecoratedElement).ref_;
        if( event.buttons === 1 ){
          if(button_click) {
            this.events_.next({ type: TabEventType.buttonClick, tab })
          }
          else {
            this.ActivateTab(target);
          }
        }
        else {
          this.events_.next({ type: TabEventType.rightClick, tab })
        }
      }

    })
    
  }
  
  /** selects the next tab (w/ rollover) */
  Next(){
    if(!this.tabs_||!this.tabs_.length) return;
    this.ActivateTab((this.active_index_ + 1) % this.tabs_.length);
  }

  /** selects the previous tab (w/ rollover) */
  Previous(){
    if(!this.tabs_||!this.tabs_.length) return;
    this.ActivateTab((this.active_index_ + this.tabs_.length - 1) % this.tabs_.length);
  }

  ClearTabs(){
    this.tabs_ = [];
    this.UpdateLayout();
  }

  AddTabs(...tabs:(TabSpec|TabSpec[])[]){
    tabs.forEach( element => {
      if( Array.isArray(element)) element.forEach( x => this.tabs_.push(x));
      else this.tabs_.push(element)
    });
    this.UpdateLayout();
  }

  ActivateTab(index:number|HTMLElement|TabSpec){

    let active = -1;
    Array.prototype.forEach.call(this.tab_container_.children, (child, i) => {
      let tab = (child as DecoratedElement).ref_;
      if( i === index || index === child || (this.tabs_.length > i && index === this.tabs_[i])){
        child.classList.add(TabClasses.active);
        active = i;
        tab.active = true;
      }
      else {
        child.classList.remove(TabClasses.active);
        tab.active = false;
      }
    });

    // if there are tabs, guarantee that one is active.
    if( active < 0 && this.tabs_.length > 0 ) return this.ActivateTab(0);

    // send a deactivate (not cancelable)
    if( this.active_index_ >= 0 && this.active_index_ < this.tabs_.length ){
      this.events_.next({ type: TabEventType.deactivate, tab: this.tabs_[this.active_index_]});
    }

    // update index and send an activate
    this.active_index_ = active;
    this.events_.next({ type: TabEventType.activate, tab: this.tabs_[active]});

  }

  private UpdateLayout(){

    while( this.tab_container_.lastChild ) this.tab_container_.removeChild(this.tab_container_.lastChild);

    this.tabs_.forEach((tab, index) => {

      // tab properties are defined on the tab element
      
      let node = document.createElement("div") as DecoratedElement;
      node.ref_ = tab;
      node.classList.add("tab-panel-tab");

      if( tab.dirty ) node.classList.add(TabClasses.dirty);
      if( tab.closeable ) node.classList.add(TabClasses.closeable);

      // icon classes, if any, are defined on the icon itself

      if(tab.icon){
        let icon = document.createElement("div");
        icon.classList.add("tab-panel-tab-icon");
        if( tab.icon_class ) icon.classList.add(tab.icon_class);
        node.appendChild(icon);
      }
        
      let label = document.createElement("div");
      label.classList.add("tab-panel-tab-label");
      label.textContent = tab.label;
      if(tab.tooltip) label.setAttribute("title", tab.tooltip);
      node.appendChild(label);

      if(tab.button){
        let button = document.createElement("div");
        button.classList.add("tab-panel-tab-button");
        node.appendChild(button);
      }

      this.tab_container_.appendChild(node);
    });

    this.ActivateTab(this.active_index_||0);

  }

}
