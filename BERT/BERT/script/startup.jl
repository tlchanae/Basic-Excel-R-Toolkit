
#
# NOTE: this changes in Julia > 0.6.2, which will come out soon. this 
# is a temporary solution only. 
#
# this is because the old version of with_output_color checked this 
# global flag -- more recent versions look up the value of :color in 
# the IOStream, which we can wrap via IOContext.
#

Base.eval(:(have_color=true));

# =============================================================================
#
# create a module for scoped functions
#
# =============================================================================
module BERT

  module EXCEL
    Application = nothing
  end

  function ShellHelp(str)
    Markdown.term(STDOUT, Main.eval(Base.Docs.helpmode(str)));
    nothing
  end

  # EXCEL = nothing

  const colors = Base.AnyDict(
      :black         => "\033[30m",
      :red           => "\033[31m",
      :green         => "\033[32m",
      :yellow        => "\033[33m",
      :blue          => "\033[34m",
      :magenta       => "\033[35m",
      :cyan          => "\033[36m",
      :white         => "\033[37m",
      :light_black   => "\033[90m", # gray
      :light_red     => "\033[91m",
      :light_green   => "\033[92m",
      :light_yellow  => "\033[93m",
      :light_blue    => "\033[94m",
      :light_magenta => "\033[95m",
      :light_cyan    => "\033[96m",
      :red_bg        => "\033[41m",
      :green_bg      => "\033[42m",
      :yellow_bg     => "\033[43m",
      :blue_bg       => "\033[44m",
      :normal        => "\033[0m",
      :default       => "\033[39m",
      :bold          => "\033[1m",
      :underline     => "\033[4m",
      :blink         => "\033[5m",
      :reverse       => "\033[7m",
      :hidden        => "\033[8m",
      :nothing       => "",
    );

  #---------------------------------------------------------------------------- 
  # banner under regular julia banner
  #---------------------------------------------------------------------------- 

  Banner = function()


    print("""

$(colors[:green])BERT$(colors[:normal]) Julia shell version 0.1 BETA. $(colors[:reverse])This is not the default Julia shell$(colors[:normal]). Many
things are similar, but some things are different. Please send feedback if you
have questions or comments, and save your work often. 


""");

  end

  #
  # this function gets a list of all functions in Main, returning function 
  # name and list of argument names. note that (at least for now) we don't
  # support named arguments; only ordinal arguments.
  #
  # there may be a faster way to do this from code
  #
  ListFunctions = function()
    function_list = filter(x -> (x != "ans" && getfield(Main, x) isa Function), names(Main)) 
    map(function(x)
      m = match( r"\(([^\(]*)\) in", string(methods(getfield(Main, x))))
      arguments = map(x -> strip(x), split(m[1], ",", keep=false))
      [string(x), arguments...]
    end, function_list )
  end

  #
  #
  #
  Autocomplete = function(buffer, position)
    try
      return Base.REPLCompletions.completions(buffer, position)[1];
    catch
    end
    return nothing;
  end

  #
  #
  #
  SetCallbacks = function(com_callback::Ptr{Void}, callback::Ptr{Void})

    # clearly I don't understand how julia closures work

    global __callback_pointer = callback
    global __com_callback_pointer = com_callback
    nothing
  end

  #
  #
  #
  Callback = function(command::String, arguments::Any = nothing)
    ccall(BERT.__callback_pointer, Any, (Cstring, Any), command, arguments)
  end

  #
  # calls release on a COM pointer. 
  #
  # FIXME: we are not really locking down these pointers, so they might 
  # get copied (you can certainly do that expressly if you want). we might
  # think about adding a callback in the ctor so we're aware of extra 
  # copies (possibly calling addref, or maybe using a second-order refcount
  # on top).
  # 
  # it's probably not possible to perfectly lock these, but we might do a 
  # better job of hiding. 
  #
  FinalizeCOMPointer = function(x)
    Callback("release-pointer", x.p)
  end

  #
  # NOTE: object with finalizer has to be mutable (?)
  #
  mutable struct FinalizablePointer 
    p::Ptr{UInt64}
    function FinalizablePointer(p)
      instance = new(p)
      finalizer(instance, FinalizeCOMPointer)
      return instance # necessary?
    end
  end

  #
  # creates a type representing a COM interface. this _creates_
  # types, it does not instantiate them; this should only be 
  # called once per type. after that they can be instantiated 
  # directly.
  #
  macro CreateCOMTypeInternal(struct_name, descriptor)

    local descriptor_ = eval(descriptor)
    local functions_list = descriptor_[3]

    local translate_name = function(x)
      name, call_type = x
      if call_type == "get"
        return Symbol("get_", name)
      elseif call_type == "put"    
        return Symbol("put_", name)
      else
        return Symbol(name)
      end
    end

    local struct_type = quote
      struct $struct_name 
        _pointer
        $([translate_name(x) for x in functions_list]...)
      end
    end

    return struct_type

  end

  #
  # creates wrappers for COM pointers. types are generated on the fly
  # and stuffed into this namespace (glad that works, btw). subsequent
  # calls return instances. 
  #
  CreateCOMType = function(descriptor)

    name, pointer, functions_list = descriptor
    sym = Symbol("com_interface_", name)
    if(!isdefined(BERT, sym))
      eval(:(@CreateCOMTypeInternal($sym, $descriptor)))
      eval(:(Base.show(io::IO, object::$(sym)) = print(string("COM interface ", $(name), " ", object._pointer.p))))
    end

    local functions = map(x -> function(args...)
      return eval(:( ccall(BERT.__com_callback_pointer, Any, (UInt64, Cstring, Cstring, UInt32, Any), 
        $(pointer), $(x[1]), $(x[2]), $(x[3]), [$(args)...])))
    end, functions_list)
    
    return eval(:( $(sym)(FinalizablePointer($(pointer)), $(functions...))))

  end

  # ####################################

  #
  # single enum
  #
  macro CreateCOMEnumType(struct_name, descriptor)

    _descriptor = eval(descriptor)
    name, value_list = _descriptor

    sym = Symbol(struct_name)

    return quote
      struct $sym 
        $([Symbol(x[1]) for x in value_list]...)
        function $sym() 
          new($([x[2] for x in value_list]...))
        end
      end
    end

  end

  CreateCOMEnum = function(parent_object, descriptor)

    name, values = descriptor
    struct_name = string("com_enum_", parent_object, "_", name)

    # create the enum type
    if(!isdefined(Symbol(struct_name)))
      eval(:(@CreateCOMEnumType($struct_name, $descriptor)))
    end

    # create instance
    eval(:($(Symbol(struct_name))()))

  end

  #
  # composite/container type
  #
  macro CreateCOMEnumsType(struct_name, name_list, value_list)

    sym = Symbol(struct_name)

    return quote
      struct $sym 
        Application
        $([Symbol(x) for x in name_list]...)
        function $sym(application) 
          new(application, $(value_list...))
        end
      end
    end

  end

  #
  # this is * way * too slow to use. creating lots of structs is painful.
  # not sure if this was caused by defining the structs or by instantiating
  # them (NOTE: we tried both inner constructor and explicit constructor, 
  # both were bad).
  #
  # we have to do this another way.
  #
  CreateCOMEnums = function(parent_object, descriptor, pointer)

    struct_name = string("com_enums_", parent_object)

    # map(x -> x[1], descriptor)
    instance_list = map(x -> CreateCOMEnum(parent_object, x), descriptor)
    name_list = map(x -> x[1], descriptor)

    eval(:(@CreateCOMEnumsType($struct_name, $name_list, $instance_list)))
    eval(:($(Symbol(struct_name))($pointer)))

  end

  #
  # this is pretty fast, even if it's rewriting. it's night and day
  # vis a vis using structs. (also love that you can redefine modules).
  #
  # would like to remove the eval function from each module, though.
  #
  CreateEnumModules = function(mod, enums_list)

    # create all modules 
    names = [x[1] for x in enums_list]
    [mod.eval( Expr( :toplevel, :(module $(Symbol(name)); end)))
      for name in names]
    nothing

    # add values
    foreach(function(x)
      name, entries = x
      CreateEnumValues(mod, name, entries)
    end, enums_list)

  end

  #
  # also pretty fast. much better. could probably speed it up by
  # consolidating all the evals. (FIXME: maybe via quote?)
  #
  CreateEnumValues = function(parent_module, module_name, values)
    mod = getfield(parent_module, Symbol(module_name))
    [eval(mod, :($(Symbol(x[1])) = $(x[2]))) for x in values]
  end

  #
  # installs the root "Application" pointer in the EXCEL module
  #
  InstallApplicationPointer = function(descriptor)
    global ApplicationDescriptor = descriptor # for dev/debug
   
    local app = CreateCOMType(descriptor)
    EXCEL.eval(:(Application = $(app)))

    # use module system
    CreateEnumModules(EXCEL, descriptor[4])
   
    nothing
  end

end

#
# hoist into namespace
#
using BERT.EXCEL

#
# banners: print julia banner from the REPL, then our banner
#
Base.banner();
BERT.Banner();