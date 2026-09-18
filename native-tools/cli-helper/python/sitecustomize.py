import builtins

from MagicHat import mhcall, mhgetenv, mhsetenv, mhsettaskdetail, mhsettaskstate, mhsettasktitle


builtins.mhcall = mhcall
builtins.mhsetenv = mhsetenv
builtins.mhgetenv = mhgetenv
builtins.mhsettaskdetail = mhsettaskdetail
builtins.mhsettaskstate = mhsettaskstate
builtins.mhsettasktitle = mhsettasktitle