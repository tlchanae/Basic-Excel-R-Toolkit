/**
 * Copyright (c) 2017-2018 Structured Data, LLC
 * 
 * This file is part of BERT.
 *
 * BERT is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * BERT is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with BERT.  If not, see <http://www.gnu.org/licenses/>.
 */

#pragma once

#include "resource.h"       // main symbols

#include <atlsafe.h>
#include <Gdiplus.h>

typedef IDispatchImpl<IRibbonExtensibility, &__uuidof(IRibbonExtensibility), &LIBID_Office, /* wMajor = */ 2, /* wMinor = */ 4> RIBBON_INTERFACE;
typedef int(*SetPointersProcedure)(ULONG_PTR, ULONG_PTR);

typedef enum {
  ShowConsole = 1001,
  GetImage,
  GetLabel
} DispIds;

// CConnect
class ATL_NO_VTABLE CConnect :
  public CComObjectRootEx<CComSingleThreadModel>,
  public CComCoClass<CConnect, &CLSID_Connect>,
  public IDispatchImpl<AddInDesignerObjects::_IDTExtensibility2, &AddInDesignerObjects::IID__IDTExtensibility2, &AddInDesignerObjects::LIBID_AddInDesignerObjects, 1, 0>,
  public RIBBON_INTERFACE
{
public:
  CConnect() : m_pApplication(0)
  {
  }

  DECLARE_REGISTRY_RESOURCEID(IDR_BERTRIBBON2)
  DECLARE_NOT_AGGREGATABLE(CConnect)

  BEGIN_COM_MAP(CConnect)
    COM_INTERFACE_ENTRY2(IDispatch, IRibbonExtensibility)
    COM_INTERFACE_ENTRY(AddInDesignerObjects::_IDTExtensibility2)
    COM_INTERFACE_ENTRY(IRibbonExtensibility)
  END_COM_MAP()

  DECLARE_PROTECT_FINAL_CONSTRUCT()

  HRESULT FinalConstruct()
  {
    return S_OK;
  }

  void FinalRelease()
  {
  }

public:

public:
  //IDTExtensibility2 implementation:
  STDMETHOD(OnConnection)(IDispatch * Application, AddInDesignerObjects::ext_ConnectMode ConnectMode, IDispatch *AddInInst, SAFEARRAY **custom);
  STDMETHOD(OnDisconnection)(AddInDesignerObjects::ext_DisconnectMode RemoveMode, SAFEARRAY **custom);
  STDMETHOD(OnAddInsUpdate)(SAFEARRAY **custom);
  STDMETHOD(OnStartupComplete)(SAFEARRAY **custom);
  STDMETHOD(OnBeginShutdown)(SAFEARRAY **custom);

  STDMETHOD(GetImage)(int32_t image_id, VARIANT *result);

  CComPtr<IDispatch>      m_pApplication;
  CComPtr<IDispatch>      m_pAddInInstance;
  CComQIPtr<IRibbonUI>    m_pRibbonUI;

  // IRibbonExtensibility methods
  STDMETHOD(GetCustomUI)(BSTR RibbonID, BSTR *pbstrRibbonXML);

  // IDispatch methods
  STDMETHOD(GetIDsOfNames)(REFIID riid, LPOLESTR* rgszNames, UINT cNames, LCID lcid, DISPID* rgdispid) {

    int disp_id = 0;

    if (cNames > 0) {
      if (!wcscmp(rgszNames[0], L"ShowConsole")) disp_id = DispIds::ShowConsole;
      else if (!wcscmp(rgszNames[0], L"GetImage")) disp_id = DispIds::GetImage;
      else if (!wcscmp(rgszNames[0], L"GetLabel")) disp_id = DispIds::GetLabel;
    }

    if (disp_id > 0)
    {
      rgdispid[0] = disp_id;
      return S_OK;
    }

    return RIBBON_INTERFACE::GetIDsOfNames(riid, rgszNames, cNames, lcid, rgdispid);
  }



  STDMETHOD(Invoke)(DISPID dispidMember, REFIID riid,
    LCID lcid, WORD wFlags, DISPPARAMS* pdispparams, VARIANT* pvarResult,
    EXCEPINFO* pexcepinfo, UINT* puArgErr)
  {
    static CComBSTR bstr;
    CComVariant result;

    switch (dispidMember)
    {
    case DispIds::GetLabel:
      result = "BERT\u00a0Console";
      result.Detach(pvarResult);
      return S_OK;

    case DispIds::GetImage:
      return GetImage(IDB_PNG1, pvarResult);

    case DispIds::ShowConsole:
      return HandleControlInvocation("BERT.Console()");
    }

    return RIBBON_INTERFACE::Invoke(dispidMember, riid, lcid, wFlags, pdispparams, pvarResult, pexcepinfo, puArgErr);
  }

  // Local Methods

  int SetPointers(ULONG_PTR excel_pointer, ULONG_PTR ribbon_pointer)
  {
    HANDLE handle = GetCurrentProcess();
    HMODULE module_handles[1024];
    DWORD bytes;
    char buffer[MAX_PATH];

    if (EnumProcessModules(handle, module_handles, sizeof(module_handles), &bytes))
    {
      int count = bytes / sizeof(HANDLE);
      for (int i = 0; i < count; i++)
      {
        if (GetModuleFileNameExA(handle, module_handles[i], buffer, MAX_PATH))
        {
          std::string module_name(buffer);
          if (std::string::npos != module_name.find("BERT") && std::string::npos != module_name.find(".xll"))
          {
            auto procedure = GetProcAddress(module_handles[i], "BERT_SetPointers");
            if (procedure) {
              SetPointersProcedure set_pointers = reinterpret_cast<SetPointersProcedure>(procedure);
              set_pointers(excel_pointer, ribbon_pointer);
              return 0;
            }
          }
        }
      }
    }

    return -1;
  }

  HRESULT HandleCacheRibbon(DISPPARAMS* pdispparams)
  {
    if (pdispparams->cArgs > 0
      && pdispparams->rgvarg[0].vt == VT_DISPATCH)
    {
      m_pRibbonUI = pdispparams->rgvarg[0].pdispVal;
      return S_OK;
    }
    return E_FAIL;
  }

  HRESULT HandleControlInvocation(const char *szCmd)
  {
    CComQIPtr< Excel::_Application > pApp(m_pApplication);
    if (pApp)
    {
      CComBSTR bstrCmd(szCmd);
      CComVariant cvRslt;
      HRESULT hr = pApp->ExecuteExcel4Macro(bstrCmd, 1033, &cvRslt);
    }
    return S_OK;
  }

};

OBJECT_ENTRY_AUTO(__uuidof(Connect), CConnect)
